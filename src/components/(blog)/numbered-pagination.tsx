import { ChevronLeft, ChevronRight } from "lucide-react";

import {
    PAGER_ACTIVE_CLS,
    PAGER_ARROW_CLS,
    PAGER_BLOCK_CLS,
    PAGER_ELLIPSIS_CLS,
    PAGER_IDLE_CLS,
    PAGER_ITEM_CLS,
    PAGER_NAV_CLS,
    buildPageItems,
} from "@/lib/pagination";
import { cn } from "@/lib/utils";

interface NumberedPaginationProps {
    page: number;
    totalPages: number;
    /** 生成第 p 页的链接（需带上当前筛选条件） */
    makePageHref: (page: number) => string;
}

/** 「上一页 / 下一页」链接（到边界时退化为不可点的占位，保证两侧宽度稳定） */
function NavLink({ href, disabled, children }: { href?: string; disabled: boolean; children: React.ReactNode }) {
    if (disabled || !href) {
        return (
            <span className={cn(PAGER_NAV_CLS, "cursor-not-allowed text-muted-foreground/50")} aria-disabled="true">
                {children}
            </span>
        );
    }
    return (
        <a href={href} className={PAGER_NAV_CLS}>
            {children}
        </a>
    );
}

/**
 * 前台统一页码分页：左箭头 · 页码 · 省略号 · 右箭头（同一个块内，当前页实心主题色背景），
 * 块后面再跟「上一页 / 下一页」。
 * 与后台的 PaginationControls 共用 src/lib/pagination.ts 的分页算法与样式，保证前后台一致。
 */
export function NumberedPagination({ page, totalPages, makePageHref }: NumberedPaginationProps) {
    const current = Math.min(Math.max(1, page), totalPages);

    return (
        <nav aria-label="分页" className="editorial-pager flex flex-wrap items-center justify-center gap-2">
            <div className={PAGER_BLOCK_CLS}>
                <NavArrow
                    href={current > 1 ? makePageHref(current - 1) : undefined}
                    disabled={current <= 1}
                    label="上一页"
                >
                    <ChevronLeft className="size-3.5" />
                </NavArrow>

                {buildPageItems(current, totalPages).map((item, index) =>
                    item === "ellipsis" ? (
                        <span key={`ellipsis-${index}`} aria-hidden className={PAGER_ELLIPSIS_CLS}>
                            ···
                        </span>
                    ) : (
                        <a
                            key={item}
                            href={makePageHref(item)}
                            aria-label={`第 ${item} 页`}
                            aria-current={item === current ? "page" : undefined}
                            className={cn(PAGER_ITEM_CLS, item === current ? PAGER_ACTIVE_CLS : PAGER_IDLE_CLS)}
                        >
                            {item}
                        </a>
                    )
                )}

                <NavArrow
                    href={current < totalPages ? makePageHref(current + 1) : undefined}
                    disabled={current >= totalPages}
                    label="下一页"
                >
                    <ChevronRight className="size-3.5" />
                </NavArrow>
            </div>

            <NavLink href={current > 1 ? makePageHref(current - 1) : undefined} disabled={current <= 1}>
                上一页
            </NavLink>
            <NavLink href={current < totalPages ? makePageHref(current + 1) : undefined} disabled={current >= totalPages}>
                下一页
            </NavLink>
        </nav>
    );
}

/** 页码块内的左右箭头（链接版） */
function NavArrow({
    href,
    disabled,
    label,
    children,
}: {
    href?: string;
    disabled: boolean;
    label: string;
    children: React.ReactNode;
}) {
    if (disabled || !href) {
        return (
            <span className={cn(PAGER_ARROW_CLS, "opacity-40")} aria-label={label} aria-disabled="true">
                {children}
            </span>
        );
    }
    return (
        <a href={href} aria-label={label} title={label} className={PAGER_ARROW_CLS}>
            {children}
        </a>
    );
}
