import type { Metadata } from "next";

import { ArticleCard } from "@/components/(blog)/article-card";
import { HomeLeadStory } from "@/components/(blog)/home-lead-story";
import { HomeMasthead } from "@/components/(blog)/home-masthead";
import { NumberedPagination } from "@/components/(blog)/numbered-pagination";
import { PageWithSidebar } from "@/components/(blog)/page-with-sidebar";

import { getPublicArticlesApi } from "@/lib/api";
import { generateBlogMetadata } from "@/lib/seo";
import { getSiteConfigs } from "@/lib/site-config";
import { resolveAssetUrl } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata();
}

const PAGE_SIZE_FALLBACK = 10;

export default async function Home({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
    const { page: pageRaw } = await searchParams;
    const page = Math.max(1, parseInt(pageRaw ?? "1", 10) || 1);

    // 每页条数跟 post.default.page_size 走（与 /posts 一致）；取不到或非法值退回 10。
    // 配置必须在取文章之前定下来，否则分页总数会跟实际页大小对不上。
    const config = await getSiteConfigs();
    const configuredPageSize = config?.post?.default?.page_size;
    const pageSize = typeof configuredPageSize === "number" && configuredPageSize > 0 ? configuredPageSize : PAGE_SIZE_FALLBACK;

    const { list, total } = await getPublicArticlesApi({ page, pageSize });

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const defaults = config?.post?.default;
    const defaultCover = resolveAssetUrl(defaults?.cover);
    const enablePrimaryColorTag = defaults?.enable_primary_color_tag === true;

    // 第一页把最新一篇提成头条（封面故事），下面的目录从第二篇开始，同一篇文章不出现两次。
    // 翻页时不再有头条，按普通目录排 —— 头条是「本期封面」，只属于第一页。
    const lead = page === 1 ? list[0] : undefined;
    const rest = lead ? list.slice(1) : list;

    return (
        <PageWithSidebar>
            <div className="w-full">
                {/* 首页刊头：站名 + 导语 + 期号印记（编辑部风的 A 步）。
                    只在第一页显示，翻页时不重复占版面。 */}
                {page === 1 && (
                    <HomeMasthead
                        name={config?.APP_NAME ?? "葱苓小筑"}
                        tagline={config?.SUB_TITLE || config?.SITE_DESCRIPTION}
                        total={total}
                    />
                )}

                {lead && <HomeLeadStory article={lead} defaultCover={defaultCover} />}

                {rest.length > 0 && (
                    <div className="w-full border-t border-border/60">
                        {rest.map((article) => (
                            <ArticleCard
                                key={article.id}
                                article={article}
                                defaultCover={defaultCover}
                                enablePrimaryColorTag={enablePrimaryColorTag}
                            />
                        ))}
                    </div>
                )}

                {list.length === 0 && (
                    <div className="py-20 text-center text-muted-foreground">
                        {page > 1 ? "该页没有文章" : "暂无文章，敬请期待"}
                    </div>
                )}

                {/* 只有一页时不摆分页控件：没有可去的地方，那排页码只是噪音 */}
                {totalPages > 1 && (
                    <div className="mt-10">
                        <NumberedPagination page={page} totalPages={totalPages} makePageHref={(p) => `/?page=${p}`} />
                    </div>
                )}
            </div>
        </PageWithSidebar>
    );
}
