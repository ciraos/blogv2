import Link from "next/link";

import type { FooterConfig } from "@/types/site-config";

interface FooterUptimeKumaProps {
    /** footer.uptime_kuma 配置段（enable / page_url 全部来自站点配置，不硬编码） */
    config?: FooterConfig["uptime_kuma"];
}

/** 心跳接口的判定结果 */
type KumaStatus = "ok" | "partial" | "error";

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
 * 有任意一项不是 1 → partial；请求失败/超时/没有监控项 → error。
 * 判定口径与官方主题（components/layout/Footer/index.tsx）一致。
 */
async function fetchKumaStatus(heartbeatUrl: string): Promise<KumaStatus> {
    try {
        const response = await fetch(heartbeatUrl, {
            // 服务端拉取（浏览器直连会被状态页的 CORS 名单挡住，且能避免每个访客都打一次）
            next: { revalidate: 60 },
            signal: AbortSignal.timeout(2500),
        });
        if (!response.ok) return "error";
        const data = (await response.json()) as { heartbeatList?: Record<string, { status?: number }[]> };
        const monitors = Object.values(data.heartbeatList ?? {});
        if (monitors.length === 0) return "error";
        const hasDown = monitors.some((beats) => beats.length > 0 && beats.at(-1)?.status !== 1);
        return hasDown ? "partial" : "ok";
    } catch {
        // 网络不通 / 超时 / 返回不是 JSON：都不该让页面出错，退化成「只给入口」的形态
        return "error";
    }
}

/** 各状态对应的文案与配色（对齐官方：正常绿、异常琥珀、取不到红；解析不出地址时中性灰） */
const STATUS_STYLE: Record<KumaStatus | "unknown", { text: string; dot: string; label: string }> = {
    ok: { text: "所有业务正常", dot: "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.55)]", label: "text-emerald-500" },
    partial: { text: "部分服务异常", dot: "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.55)]", label: "text-amber-500" },
    error: { text: "状态获取失败", dot: "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.55)]", label: "text-red-500" },
    unknown: { text: "运行状态", dot: "bg-muted-foreground/60", label: "text-muted-foreground" },
};

/**
 * 页脚状态入口（**内联形态**，供底栏的备案信息行使用）。挂在 footer-bottom-bar 里，
 * 跟 ICP 备案号同一行、紧随其后 —— 与官方主题的 recordInfo 布局一致。
 *
 * 状态是服务端实时取的（60s 缓存），**文字本身就是状态**（与官方主题口径一致）：
 * 所有业务正常 / 部分服务异常 / 状态获取失败；只有状态页地址解析不出来时才退回中性的「运行状态」。
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
