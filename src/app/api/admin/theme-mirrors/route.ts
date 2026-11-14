import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { adminToken } from "@/lib/admin-api";
import {
    THEME_MIRRORS,
    buildMirrorCandidates,
    isAllowedThemeSource,
    unwrapMirrorUrl,
    type MirrorProbeResult,
} from "@/lib/theme-mirrors";

/**
 * GitHub 镜像测速（管理员）。
 *
 * 为什么在服务端测：Anheyu 安装 SSR 主题时由**后端**下载 tar.gz
 * （pkg/ssr/manager.go 里 http.Client 直接 GET，60 秒超时），所以"哪个镜像快"
 * 取决于服务器网络，浏览器视角会误导（本机开代理时尤其明显）。
 *
 * 探测方式：对每个候选发一个 `Range: bytes=0-524287` 的 GET，**边读边计时**：
 * 攒够 512KB 或到 10 秒就停（abort 后仍用已读到的字节算速度，不会因为超时全丢）。
 * 再结合 `content-range` 里的包总大小，估算"整个包要下多久"，超过 45 秒标为太慢
 * —— 因为后端 60 秒就断了，这种镜像即使能下也装不上。
 *
 * 安全：只允许探测 GitHub 系域名（ALLOWED_HOSTS），镜像固定白名单，
 * 不接受任意 URL，避免变成 SSRF 跳板。
 */

const PROBE_BYTES = 512 * 1024;
const PROBE_TIMEOUT_MS = 10_000;
/** 后端 http.Client 超时 60s，留 15s 余量 */
const ETA_LIMIT_SECONDS = 45;

async function probeOne(candidate: { id: string; label: string; url: string }): Promise<MirrorProbeResult> {
    const started = performance.now();
    let bytes = 0;
    let status = 0;
    let totalBytes = 0;
    let ttfb = 0;
    let failure = "";

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

    try {
        const res = await fetch(candidate.url, {
            method: "GET",
            headers: { Range: `bytes=0-${PROBE_BYTES - 1}` },
            signal: controller.signal,
            cache: "no-store",
            redirect: "follow",
        });
        status = res.status;
        ttfb = performance.now() - started;

        // content-range: bytes 0-524287/18874368 → 能拿到整包大小
        const contentRange = res.headers.get("content-range") ?? "";
        totalBytes = Number(contentRange.split("/")[1] ?? 0) || 0;

        const reader = res.body?.getReader();
        if (reader) {
            while (bytes < PROBE_BYTES) {
                const { done, value } = await reader.read();
                if (done) break;
                bytes += value?.byteLength ?? 0;
            }
            await reader.cancel().catch(() => undefined);
        }
    } catch (error) {
        // 超时/中断：只要已经读到字节，就照常算速度（慢速镜像常走这条）
        if (!bytes) {
            failure = error instanceof Error ? error.name : "请求失败";
        }
    } finally {
        clearTimeout(timer);
    }

    const elapsed = performance.now() - started;
    const transferMs = Math.max(1, elapsed - ttfb);
    const speedMBps = bytes > 0 ? (bytes / 1024 / 1024 / transferMs) * 1000 : 0;
    const effectiveTotal = totalBytes > 0 ? totalBytes : bytes;
    const etaSeconds = speedMBps > 0 ? effectiveTotal / 1024 / 1024 / speedMBps : 0;
    const ok = (status === 200 || status === 206) && bytes > 0;

    return {
        id: candidate.id,
        label: candidate.label,
        url: candidate.url,
        ok,
        status,
        ttfb: Math.round(ttfb),
        elapsed: Math.round(elapsed),
        bytes,
        totalBytes: effectiveTotal,
        speedMBps: Number(speedMBps.toFixed(2)),
        etaSeconds: ok ? Math.round(etaSeconds) : 0,
        slow: ok && etaSeconds > ETA_LIMIT_SECONDS,
        ...(ok ? {} : { error: failure || `HTTP ${status}` }),
    };
}

export async function POST(request: NextRequest) {
    if (!(await adminToken())) {
        return NextResponse.json({ code: 401, message: "未登录", data: null }, { status: 401 });
    }

    let body: { url?: unknown };
    try {
        body = (await request.json()) as typeof body;
    } catch {
        return NextResponse.json({ code: 400, message: "请求体格式错误", data: null }, { status: 400 });
    }

    const raw = typeof body?.url === "string" ? body.url.trim() : "";
    if (!raw) {
        return NextResponse.json({ code: 400, message: "请先填写下载地址", data: null }, { status: 400 });
    }

    // 允许粘贴「已带镜像前缀」的地址：先还原成原始 GitHub 链接再统一生成候选
    const original = unwrapMirrorUrl(raw);
    if (!isAllowedThemeSource(original)) {
        return NextResponse.json(
            { code: 400, message: "只支持探测 GitHub 系地址（github.com / raw / codeload 等）", data: null },
            { status: 400 }
        );
    }

    const candidates = buildMirrorCandidates(original);
    const results = await Promise.all(candidates.map((c) => probeOne(c)));

    // 排序：够快 → 能下但太慢 → 不可用；同档按预计耗时升序
    results.sort((a, b) => {
        const rank = (r: MirrorProbeResult) => (!r.ok ? 2 : r.slow ? 1 : 0);
        if (rank(a) !== rank(b)) return rank(a) - rank(b);
        if (a.ok && b.ok) return a.etaSeconds - b.etaSeconds;
        return a.elapsed - b.elapsed;
    });

    return NextResponse.json({
        code: 200,
        message: "ok",
        data: {
            original,
            mirrorCount: THEME_MIRRORS.length,
            etaLimit: ETA_LIMIT_SECONDS,
            results,
            anyFastEnough: results.some((r) => r.ok && !r.slow),
            fastest: (results.find((r) => r.ok && !r.slow) ?? results.find((r) => r.ok))?.url ?? "",
        },
    });
}
