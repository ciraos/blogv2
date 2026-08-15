import type { PostItem } from "@/types/articles";
import {
    Pagination,
    PaginationContent,
    PaginationEllipsis,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
} from "@/components/ui/pagination";
import { ArticleCard } from "@/components/(blog)/article-card";

interface PagedArticleListProps {
    articles: PostItem[];
    total: number;
    page: number;
    pageSize: number;
    /** 生成第 p 页的链接（需带上当前筛选条件） */
    makePageHref: (page: number) => string;
    emptyText?: string;
}

/** 文章卡片网格 + 分页（供首页 / 归档 / 分类 / 标签共用） */
export function PagedArticleList({
    articles,
    total,
    page,
    pageSize,
    makePageHref,
    emptyText = "暂无文章，敬请期待",
}: PagedArticleListProps) {
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return (
        <div className="w-full space-y-6">
            {articles.length === 0 ? (
                <div className="py-20 text-center text-muted-foreground">
                    {page > 1 ? "该页没有文章" : emptyText}
                </div>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {articles.map((article) => (
                        <ArticleCard key={article.id} article={article} />
                    ))}
                </div>
            )}

            {totalPages > 1 && (
                <Pagination>
                    <PaginationContent>
                        {page > 1 && (
                            <PaginationItem>
                                <PaginationPrevious text="上一页" href={makePageHref(page - 1)} />
                            </PaginationItem>
                        )}
                        <PaginationItem>
                            <PaginationLink isActive href={makePageHref(page)}>
                                {page} / {totalPages}
                            </PaginationLink>
                        </PaginationItem>
                        {page < totalPages && (
                            <PaginationItem>
                                <PaginationEllipsis />
                            </PaginationItem>
                        )}
                        {page < totalPages && (
                            <PaginationItem>
                                <PaginationNext text="下一页" href={makePageHref(page + 1)} />
                            </PaginationItem>
                        )}
                    </PaginationContent>
                </Pagination>
            )}
        </div>
    );
}
