import Link from "next/link";

import type { FooterConfig } from "@/types/site-config";

interface FooterUptimeKumaProps {
    /** footer.uptime_kuma 配置段（enable / page_url 全部来自站点配置，不硬编码） */
    config?: FooterConfig["uptime_kuma"];
}

/** 心跳接口的判定结果 */
type KumaStatus = "ok" | "partial" | "error" | "unknown";

/**
 * 取不到状态时的「冷却窗口」：失败过的 5 分钟内不再重试。
 *
 * 为什么需要它：Next 只缓存**成功**的 fetch，失败的不会进 60s 缓存，于是每次页面渲染都会
 * 重新握手一次 —— 站点状态页 `stat.ciraos.top` 的证书/SNI 不匹配时（服务端回
 * `SSL alert 112 unrecognized name`），dev/生产日志就会被 `fetch failed` 刷屏，
 * 每个访客还白等一次失败的 TLS。加个进程内冷却后：失败一次，5 分钟内直接按「取不到」处理。
 */
let lastFailureAt = 0;
const FAILURE_COOLDOWN_MS = 5 * 60 * 1000;

/**
 * 从状态页完整地址推导心跳接口地址。
 *
 * 后端只提供 `page_url`（如 `https://stat.ciraos.top/status/myserver`），并没有
 * `api_url` / `slug` 两个键（`internal/configdef/definition.go` 里就这两个字段），
 * 所以这里按 Kuma 状态页的固定路径规则反推：
 *   base = 地址的 origin，slug = 路径里 `/status/` 之后的最后一段（没有 `/status/` 就取最后一段）。
 * 例如 `https://stat.ciraos.top/status/myserver` → `https://stat.ciraos.top/api/status-page/heartbeat/myserver`。
 */
function resolveHeartbeatUrl(pageUrl: string): string | null {
    let parsed: URL;
    try {
        parsed = new URL(pageUrl);
    } catch {
        return null;
    }
    const segments = parsed.pathname.split("/").filter(Boolean);
    const statusIndex = segments.indexOf("status");
    const slug = statusIndex >= 0 ? segments[statusIndex + 1] : segments.at(-1);
    if (!slug) return null;
    return `${parsed.origin}/api/status-page/heartbeat/${slug}`;
}

/**
 * 取一次状态页心跳并判定：所有监控项的最后一条心跳 status 都是 1 → ok；
 * 有任意一项不是 1 → partial；接口通了但数据形状不对 → error；
 * **连不上**（网络/TLS/超时）→ unknown（中性灰，不报红）。
 *
 * 为什么「连不上」不算 error：状态页本身挂了、或者证书/域名没配好时，页脚给访客看一个红色
 * 「状态获取失败」既没有信息量也像故障公告。中性灰的「运行状态」+ 可点的入口更合适。
 */
async function fetchKumaStatus(heartbeatUrl: string): Promise<KumaStatus> {
    // 冷却窗口内直接返回，不再白跑一次 TLS 握手（见 lastFailureAt 的说明）
    if (lastFailureAt !== 0 && Date.now() - lastFailureAt < FAILURE_COOLDOWN_MS) return "unknown";

    try {
        const response = await fetch(heartbeatUrl, {
            // 服务端拉取（浏览器直连会被状态页的 CORS 名单挡住，且能避免每个访客都打一次）
            next: { revalidate: 60 },
            signal: AbortSignal.timeout(2500),
        });
        if (!response.ok) {
            // 状态页在、但返回非 2xx（反代 502、证书页 403 之类）——对访客同样是「取不到」
            lastFailureAt = Date.now();
            return "unknown";
        }
        const data = (await response.json()) as { heartbeatList?: Record<string, { status?: number }[]> };
        const monitors = Object.values(data.heartbeatList ?? {});
        if (monitors.length === 0) {
            // 通了但没有监控项：可能是 slug 写错或该状态页还没建监控，同样按「取不到」处理
            lastFailureAt = Date.now();
            return "unknown";
        }
        const hasDown = monitors.some((beats) => beats.length > 0 && beats.at(-1)?.status !== 1);
        return hasDown ? "partial" : "ok";
    } catch {
        // 网络不通 / TLS 握手失败 / 超时 / 返回不是 JSON：都不该让页面出错，也不该打扰访客
        lastFailureAt = Date.now();
        return "unknown";
    }
}

/** 各状态对应的文案与配色（正常绿、异常琥珀、数据异常红、取不到中性灰） */
const STATUS_STYLE: Record<KumaStatus, { text: string; dot: string; label: string }> = {
    ok: { text: "所有业务正常", dot: "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.55)]", label: "text-emerald-500" },
    partial: { text: "部分服务异常", dot: "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.55)]", label: "text-amber-500" },
    error: { text: "状态数据异常", dot: "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.55)]", label: "text-red-500" },
    // 取不到（离线/证书/超时）：中性灰，与「地址没配好」同一个观感，不当成故障播报
    unknown: { text: "运行状态", dot: "bg-muted-foreground/60", label: "text-muted-foreground" },
};

/**
 * 页脚状态入口（**内联形态**，供底栏的备案信息行使用）。挂在 footer-bottom-bar 里，
 * 跟 ICP 备案号同一行、紧随其后 —— 与官方主题的 recordInfo 布局一致。
 *
 * 状态是服务端实时取的（60s 缓存），**文字本身就是状态**：
 * 所有业务正常 / 部分服务异常 / 状态数据异常；连不上或地址解析不出来时退回中性的「运行状态」
 * （不向访客播报红字，失败后还有 5 分钟冷却，见 lastFailureAt）。
 * 圆点颜色与文字同步（绿 / 琥珀 / 红 / 灰），完整表述另外放进 title 与 aria-label。
 * 未开启开关或没填地址时整块不渲染。
 */
export async function FooterUptimeKuma({ config }: FooterUptimeKumaProps) {
    const pageUrl = config?.page_url?.trim();
    if (!config?.enable || !pageUrl) return null;

    const heartbeatUrl = resolveHeartbeatUrl(pageUrl);
    const status: KumaStatus | null = heartbeatUrl ? await fetchKumaStatus(heartbeatUrl) : null;
    const style = STATUS_STYLE[status ?? "unknown"];

    return (
        <Link
            href={pageUrl}
            target="_blank"
            rel="noreferrer"
            title={`运行状态 · ${style.text}`}
            aria-label={`运行状态：${style.text}`}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
            <span aria-hidden className={`size-2 shrink-0 rounded-full ${style.dot}`} />
            <span className={style.label}>{style.text}</span>
        </Link>
    );
}
