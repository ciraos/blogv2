// 分页公共逻辑与样式：后台列表（客户端回调）与前台列表（URL 链接）共用，
// 保证「页码块 + 上一页/下一页」在所有列表里长得一模一样。

/**
 * 生成页码序列：首尾固定 + 当前页前后各 siblingCount 页，中间用省略号占位。
 * 例（共 232 页、当前第 1 页）→ [1, 2, 3, 4, 5, "ellipsis", 232]
 */
export function buildPageItems(current: number, totalPages: number, siblingCount = 1): (number | "ellipsis")[] {
    const total = Math.max(1, Math.floor(totalPages) || 1);
    const page = Math.min(Math.max(1, Math.floor(current) || 1), total);
    // 首 + 尾 + 当前 + 两侧 sibling + 两个省略号
    const windowSize = siblingCount * 2 + 5;
    if (total <= windowSize) return Array.from({ length: total }, (_, i) => i + 1);

    const left = Math.max(page - siblingCount, 2);
    const right = Math.min(page + siblingCount, total - 1);
    const showLeftGap = left > 2;
    const showRightGap = right < total - 1;
    const edgeCount = 3 + siblingCount * 2;

    if (!showLeftGap && showRightGap) {
        // 靠近首页：1 2 3 4 5 … 尾
        return [...Array.from({ length: edgeCount }, (_, i) => i + 1), "ellipsis", total];
    }
    if (showLeftGap && !showRightGap) {
        // 靠近末页：首 … 尾-4 … 尾
        const start = total - edgeCount + 1;
        return [1, "ellipsis", ...Array.from({ length: edgeCount }, (_, i) => start + i)];
    }
    // 中间：首 … 当前±1 … 尾
    return [
        1,
        "ellipsis",
        ...Array.from({ length: right - left + 1 }, (_, i) => left + i),
        "ellipsis",
        total,
    ];
}

/** 页码块外壳（箭头与页码同在一个块内） */
export const PAGER_BLOCK_CLS = "flex items-center gap-0.5 rounded-xl border border-border bg-muted/30 p-0.5";

/** 页码按钮基础样式 */
export const PAGER_ITEM_CLS =
    "inline-flex h-7 min-w-7 items-center justify-center rounded-lg px-1.5 text-xs tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-50";

/** 非当前页 */
export const PAGER_IDLE_CLS = "text-muted-foreground hover:bg-muted hover:text-foreground";

/** 当前页：与侧边栏当前项同款实心主题色背景 */
export const PAGER_ACTIVE_CLS = "bg-primary font-medium text-primary-foreground hover:bg-primary/90";

/** 块内左右箭头 */
export const PAGER_ARROW_CLS =
    "inline-flex h-7 w-6 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40";

/** 省略号占位 */
export const PAGER_ELLIPSIS_CLS =
    "inline-flex h-7 min-w-6 items-center justify-center text-xs text-muted-foreground/70 select-none";

/** 「上一页 / 下一页」按钮样式（与 Button variant=outline size=sm + h-8 一致，供链接版复用） */
export const PAGER_NAV_CLS =
    "inline-flex h-8 items-center justify-center rounded-lg border border-border bg-background px-2.5 text-xs transition-colors hover:bg-muted hover:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50";
