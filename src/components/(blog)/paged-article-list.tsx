import type { PostItem } from "@/types/articles";
import { ArticleCard } from "@/components/(blog)/article-card";
import { NumberedPagination } from "@/components/(blog)/numbered-pagination";

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
// 列数随内容区宽度自适应：窄 2 列、宽 4 列（container query，见 globals.css .article-grid）
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
                <div className="article-grid grid grid-cols-1 gap-4">
                    {articles.map((article) => (
                        <ArticleCard key={article.id} article={article} />
                    ))}
                </div>
            )}

            <NumberedPagination page={page} totalPages={totalPages} makePageHref={makePageHref} />
        </div>
    );
}
