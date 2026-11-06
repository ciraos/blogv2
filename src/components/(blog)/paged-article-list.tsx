import type { PostItem } from "@/types/articles";
import { ArticleCard } from "@/components/(blog)/article-card";
import { NumberedPagination } from "@/components/(blog)/numbered-pagination";
import { getSiteConfigs } from "@/lib/site-config";
import { resolveAssetUrl } from "@/lib/utils";

interface PagedArticleListProps {
    articles: PostItem[];
    total: number;
    page: number;
    pageSize: number;
    /** 生成第 p 页的链接（需带上当前筛选条件） */
    makePageHref: (page: number) => string;
    emptyText?: string;
}

/**
 * 文章卡片网格 + 分页（供首页 / 归档 / 分类 / 标签共用）。
 *
 * 列表项外观的三个默认值直接在这里读站点配置（post.default.*），
 * 这样首页等调用方不必各自传参：默认封面 / 双栏布局 / 主色标签。
 * 注意每页条数（post.default.page_size）不在这里取——它必须在调用方取数前就确定，
 * 否则 API 拉回来的条数与本组件算出的总页数会对不上。
 */
// 列数随内容区宽度自适应：窄 2 列、宽 4 列（container query，见 globals.css .article-grid）
export async function PagedArticleList({
    articles,
    total,
    page,
    pageSize,
    makePageHref,
    emptyText = "暂无文章，敬请期待",
}: PagedArticleListProps) {
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    const config = await getSiteConfigs();
    const defaults = config?.post?.default;
    const defaultCover = resolveAssetUrl(defaults?.cover);
    const enablePrimaryColorTag = defaults?.enable_primary_color_tag === true;

    return (
        <div className="w-full space-y-6">
            {articles.length === 0 ? (
                <div className="py-20 text-center text-muted-foreground">
                    {page > 1 ? "该页没有文章" : emptyText}
                </div>
            ) : (
                // 编辑部风：单栏顺序列表（行内自带发丝分割线），不再用卡片网格
                <div className="w-full border-t border-border/60">
                    {articles.map((article) => (
                        <ArticleCard
                            key={article.id}
                            article={article}
                            defaultCover={defaultCover}
                            enablePrimaryColorTag={enablePrimaryColorTag}
                        />
                    ))}
                </div>
            )}

            <NumberedPagination page={page} totalPages={totalPages} makePageHref={makePageHref} />
        </div>
    );
}
