/**
 * 外链跳转提示（`ENABLE_EXTERNAL_LINK_WARNING`）。
 *
 * 行为对齐 anzhiyu 原版：
 * 1. 捕获阶段监听 document 上的点击，找到最近的 <a>；
 * 2. 外链、非下载、无修饰键（Ctrl/Cmd/Shift/Alt）才拦；
 * 3. 拦下来后整页跳到 /external-link-warning?url=...，由提示页展示目标地址；
 * 4. 会话里已选过「记住我的选择」就直接放行（sessionStorage）。
 *
 * 和原版的一处差别：原版跳过 `target="_blank"` 的链接，但本站正文外链统一带 _blank，
 * 照抄会导致几乎拦不到任何外链 —— 这里连 _blank 一起拦，并把是否新窗口记进 URL，
 * 由提示页在放行时还原打开方式。
 */

const SKIP_KEY = "skip-external-link-warning";

/** 相对路径、锚点、特殊协议、同源地址都不算外链 */
export function isExternalLink(url: string): boolean {
    if (!url) return false;
    if (url.startsWith("/") || url.startsWith("#") || url.startsWith("?")) return false;
    if (url.startsWith("mailto:") || url.startsWith("tel:") || url.startsWith("sms:")) return false;

    try {
        const parsed = new URL(url, window.location.origin);
        if (parsed.protocol === "javascript:" || parsed.protocol === "data:" || parsed.protocol === "blob:") {
            return false;
        }
        return parsed.host !== window.location.host;
    } catch {
        return false;
    }
}

/** 装上拦截器，返回卸载函数 */
export function initExternalLinkInterceptor(): () => void {
    const handler = (event: MouseEvent) => {
        if (event.defaultPrevented) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

        const target = event.target as HTMLElement | null;
        const link = target?.closest?.("a");
        if (!link || !link.href) return;
        // 下载、明确要求跳过的链接不拦（例如「开往」之类由代码自己处理的入口）
        if (link.hasAttribute("download")) return;
        if (link.dataset.skipExternalWarning === "true") return;
        if (!isExternalLink(link.href)) return;

        try {
            if (sessionStorage.getItem(SKIP_KEY) === "true") return;
        } catch {
            // 隐私模式下 sessionStorage 可能不可用：当作没记住，继续拦截
        }

        event.preventDefault();
        event.stopPropagation();

        const warnsUrl = `/external-link-warning?url=${encodeURIComponent(link.href)}${
            link.target === "_blank" ? "&blank=1" : ""
        }`;

        // 原本要在新标签打开的链接：把「提示页」本身开在新标签里，当前页保持不动。
        // 这里仍在 click 的回调里，属于用户手势，不会被弹窗拦截；
        // 万一被拦（返回值 null），退回同标签跳转，至少不会点了没反应。
        if (link.target === "_blank") {
            // 注意不能带 "noopener"：那样 window.open 会返回 null，拿不到句柄判断是否被拦
            const opened = window.open(warnsUrl, "_blank");
            if (opened) {
                try {
                    opened.opener = null;
                } catch {
                    // 跨源/被限制时忽略：提示页是本站页面，风险可控
                }
                return;
            }
        }

        window.location.href = warnsUrl;
    };

    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
}

export { SKIP_KEY as EXTERNAL_LINK_SKIP_KEY };
