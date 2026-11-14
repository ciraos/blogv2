"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
    PAGER_ACTIVE_CLS,
    PAGER_ARROW_CLS,
    PAGER_BLOCK_CLS,
    PAGER_ELLIPSIS_CLS,
    PAGER_IDLE_CLS,
    PAGER_ITEM_CLS,
    buildPageItems,
} from "@/lib/pagination";
import { cn } from "@/lib/utils";

interface PaginationControlsProps {
    page: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    /** 数据加载中 / 不可切换 */
    disabled?: boolean;
    /** 是否在页码块后面再渲染「上一页 / 下一页」按钮（默认 true） */
    showPrevNext?: boolean;
    className?: string;
}

/**
 * 列表页脚分页控件：左箭头 · 页码 · 省略号 · 右箭头（同一个块内，当前页用侧边栏同款实心主题色背景），
 * 块后面再跟「上一页 / 下一页」按钮。
 */
export function PaginationControls({
    page,
    totalPages,
    onPageChange,
    disabled = false,
    showPrevNext = true,
    className,
}: PaginationControlsProps) {
    const total = Math.max(1, totalPages);
    const current = Math.min(Math.max(1, page), total);
    const items = buildPageItems(current, total);

    return (
        <div className={cn("flex flex-wrap items-center gap-2", className)}>
            {total > 1 && (
                <nav aria-label="页码" className={PAGER_BLOCK_CLS}>
                    <button
                        type="button"
                        aria-label="上一页"
                        title="上一页"
                        className={PAGER_ARROW_CLS}
                        disabled={disabled || current <= 1}
                        onClick={() => onPageChange(Math.max(1, current - 1))}
                    >
                        <ChevronLeft className="size-3.5" />
                    </button>

                    {/* 移动端：一整排页码太占宽，只留「当前 / 总数」；≥sm 再展开数字 */}
                    <span className="px-1 text-xs tabular-nums text-muted-foreground sm:hidden">
                        {current} / {total}
                    </span>
                    <span className="hidden items-center sm:inline-flex">
                        {items.map((item, index) =>
                            item === "ellipsis" ? (
                                <span key={`ellipsis-${index}`} aria-hidden className={PAGER_ELLIPSIS_CLS}>
                                    ···
                                </span>
                            ) : (
                                <button
                                    key={item}
                                    type="button"
                                    aria-label={`第 ${item} 页`}
                                    aria-current={item === current ? "page" : undefined}
                                    className={cn(PAGER_ITEM_CLS, item === current ? PAGER_ACTIVE_CLS : PAGER_IDLE_CLS)}
                                    disabled={disabled}
                                    onClick={() => onPageChange(item)}
                                >
                                    {item}
                                </button>
                            )
                        )}
                    </span>

                    <button
                        type="button"
                        aria-label="下一页"
                        title="下一页"
                        className={PAGER_ARROW_CLS}
                        disabled={disabled || current >= total}
                        onClick={() => onPageChange(Math.min(total, current + 1))}
                    >
                        <ChevronRight className="size-3.5" />
                    </button>
                </nav>
            )}

            {showPrevNext && (
                /* 小屏（<640px）只留左边的页码块：页码块里本来就有左右箭头，
                   文字版「上一页 / 下一页」在窄屏会把页脚挤成两三行，纯属噪音。
                   ≥sm 才显示，且**不删 DOM** —— 大屏用户体验不变。 */
                <div className="hidden items-center gap-2 sm:flex">
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-lg text-xs"
                        disabled={disabled || current <= 1}
                        onClick={() => onPageChange(Math.max(1, current - 1))}
                    >
                        上一页
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-lg text-xs"
                        disabled={disabled || current >= total}
                        onClick={() => onPageChange(Math.min(total, current + 1))}
                    >
                        下一页
                    </Button>
                </div>
            )}
        </div>
    );
}
