/**
 * 认证页左侧刊头下方的「今日一句」。
 *
 * 纯装饰：只在服务端渲染时按日期取一句（同一天进来看到的是同一句，不会因为
 * 客户端/服务端各算一次而水合不一致）。文案风格对齐站点的「钓鱼」语气，
 * 短、可读、不喊口号。
 */
export const AUTH_QUOTES = [
    "把日子写成可以检索的样子。",
    "风带来了故事的种子，时间使其发芽。",
    "慢一点写，快一点忘掉不快。",
    "写作是把想不清楚的事，写到想清楚为止。",
    "今天也要好好吃饭，好好记流水账。",
    "有些答案，得先写下来才出现。",
    "收藏的是链接，留下的是心情。",
    "服务器会宕，记得备份。",
    "少一点表态，多一点记录。",
    "写下来的东西，才算真的发生过。",
    "不必等灵感，先打开编辑器。",
    "生活不是待办清单，偶尔也要空白页。",
] as const;

/**
 * 按「年内第几天」取一句：不引入随机数，服务端渲染结果稳定，同一天刷新不会变。
 * 抽成独立函数而不是在组件里 `Math.random()` —— 后者会和 SSR 结果对不上。
 */
export function quoteOfDay(date: Date = new Date()): string {
    const start = Date.UTC(date.getUTCFullYear(), 0, 0);
    const dayOfYear = Math.floor((date.getTime() - start) / 86400000);
    return AUTH_QUOTES[((dayOfYear % AUTH_QUOTES.length) + AUTH_QUOTES.length) % AUTH_QUOTES.length];
}

/**
 * 建站天数（与关于页同一套口径）。
 *
 * 后端 `footer.owner.since` 线上实测是年份（`2026`），偶尔可能是秒/毫秒时间戳或日期串，
 * 这里都兼容；取不到就返回 null（页面直接不显示这一行）。
 */
export function siteDays(since: number | string | undefined | null): number | null {
    if (since === undefined || since === null || since === "") return null;
    let startMs: number;
    if (typeof since === "string") {
        const parsed = Date.parse(since);
        if (Number.isNaN(parsed)) return null;
        startMs = parsed;
    } else if (since > 1e12) {
        startMs = since;
    } else if (since > 1e9) {
        startMs = since * 1000;
    } else {
        startMs = new Date(since, 0, 1).getTime();
    }
    return Math.max(1, Math.floor((Date.now() - startMs) / 86400000));
}
