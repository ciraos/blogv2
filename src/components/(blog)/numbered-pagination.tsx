import {
    Pagination,
    PaginationContent,
    PaginationEllipsis,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
} from "@/components/ui/pagination";

interface NumberedPaginationProps {
    page: number;
    totalPages: number;
    /** 生成第 p 页的链接（需带上当前筛选条件） */
    makePageHref: (page: number) => string;
}

/**
 * 生成页码序列：首尾固定，当前页前后各 1 页，中间用省略号表示
 * 例：共 30 页、当前第 8 页 → [1, "...", 7, 8, 9, "...", 30]
 */
function pageItems(current: number, total: number): (number | "ellipsis")[] {
    if (total <= 7) {
        return Array.from({ length: total }, (_, i) => i + 1);
    }
    const pages: (number | "ellipsis")[] = [1];
    if (current > 3) {
        pages.push("ellipsis");
    }
    for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) {
        pages.push(p);
    }
    if (current < total - 2) {
        pages.push("ellipsis");
    }
    pages.push(total);
    return pages;
}

/** 统一页码分页：当前页实心高亮 + 省略号 + 上一页/下一页 */
export function NumberedPagination({ page, totalPages, makePageHref }: NumberedPaginationProps) {
    if (totalPages <= 1) return null;

    return (
        <Pagination>
            <PaginationContent className="flex-wrap justify-center gap-1.5">
                {page > 1 && (
                    <PaginationItem>
                        <PaginationPrevious text="上一页" href={makePageHref(page - 1)} className="rounded-lg" />
                    </PaginationItem>
                )}

                {pageItems(page, totalPages).map((item, index) =>
                    typeof item === "number" ? (
                        <PaginationItem key={index}>
                            <PaginationLink
                                href={makePageHref(item)}
                                isActive={item === page}
                                className={
                                    item === page
                                        ? "rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
                                        : "rounded-lg"
                                }
                            >
                                {item}
                            </PaginationLink>
                        </PaginationItem>
                    ) : (
                        <PaginationItem key={index}>
                            <PaginationEllipsis />
                        </PaginationItem>
                    )
                )}

                {page < totalPages && (
                    <PaginationItem>
                        <PaginationNext text="下一页" href={makePageHref(page + 1)} className="rounded-lg" />
                    </PaginationItem>
                )}
            </PaginationContent>
        </Pagination>
    );
}
