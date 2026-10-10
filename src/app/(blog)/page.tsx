import type { Metadata } from "next";

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
                {/* 首页顶部区（HOME_TOP：标题/副标题/站点文字/分类入口/主题 banner）按用户要求不再在首页展示。
                    配置键 HOME_TOP.* 仍保留在设置页；组件 home-top.tsx 保留但暂无引用，日后想恢复挂载一行即可。 */}
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
