import type { Metadata } from "next";

import { PagedArticleList } from "@/components/(blog)/paged-article-list";
import { PageWithSidebar } from "@/components/(blog)/page-with-sidebar";

import { getPublicArticlesApi } from "@/lib/api";
import { generateBlogMetadata } from "@/lib/seo";
import { getSiteConfigs } from "@/lib/site-config";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("文章");
}

/** 兜底每页条数（站点未配置 post.default.page_size 时沿用原值） */
const PAGE_SIZE_FALLBACK = 10;

export default async function Posts({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
    const { page: pageRaw } = await searchParams;
    const page = Math.max(1, parseInt(pageRaw ?? "1", 10) || 1);

    // 每页条数：post.default.page_size（必须在取数前定下来，分页总数才对得上）
    const config = await getSiteConfigs();
    const configured = config?.post?.default?.page_size;
    const pageSize = typeof configured === "number" && configured > 0 ? configured : PAGE_SIZE_FALLBACK;

    const { list, total } = await getPublicArticlesApi({ page, pageSize });

    return (
        <PageWithSidebar>
            <PagedArticleList
                articles={list}
                total={total}
                page={page}
                pageSize={pageSize}
                makePageHref={(p) => `/posts?page=${p}`}
            />
        </PageWithSidebar>
    )
}
