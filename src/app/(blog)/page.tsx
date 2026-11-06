import type { Metadata } from "next";

import { HomeMasthead } from "@/components/(blog)/home-masthead";
import { PagedArticleList } from "@/components/(blog)/paged-article-list";
import { PageWithSidebar } from "@/components/(blog)/page-with-sidebar";

import { getPublicArticlesApi } from "@/lib/api";
import { generateBlogMetadata } from "@/lib/seo";
import { getSiteConfigs } from "@/lib/site-config";

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

    return (
        <PageWithSidebar>
            <div className="w-full space-y-12">
                {/* 首页刊头：大号站名 + 期号 + 日期 + 导语（编辑部风的 A 步）。
                    只在第一页显示，翻页时不重复占版面。 */}
                {page === 1 && (
                    <HomeMasthead
                        name={config?.APP_NAME ?? "葱苓小筑"}
                        tagline={config?.SUB_TITLE || config?.SITE_DESCRIPTION}
                        total={total}
                    />
                )}

                <PagedArticleList
                    articles={list}
                    total={total}
                    page={page}
                    pageSize={pageSize}
                    makePageHref={(p) => `/?page=${p}`}
                />
            </div>
        </PageWithSidebar>
    );
}
