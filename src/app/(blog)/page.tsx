import type { Metadata } from "next";

import { EssayTimeline } from "@/components/(blog)/essay-timeline";
import { PagedArticleList } from "@/components/(blog)/paged-article-list";

import { getPublicArticlesApi, getPublicEssaysApi } from "@/lib/api";
import { generateBlogMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata();
}

const PAGE_SIZE = 10;

export default async function Home({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
    const { page: pageRaw } = await searchParams;
    const page = Math.max(1, parseInt(pageRaw ?? "1", 10) || 1);

    // 文章列表 + 首页即刻（即刻接口失败时不影响文章列表）
    const [{ list, total }, essaysData] = await Promise.all([
        getPublicArticlesApi({ page, pageSize: PAGE_SIZE }),
        getPublicEssaysApi({ page: 1, page_size: 8 }).catch(() => null),
    ]);

    return (
        <div className="w-full space-y-12">
            <PagedArticleList
                articles={list}
                total={total}
                page={page}
                pageSize={PAGE_SIZE}
                makePageHref={(p) => `/?page=${p}`}
            />

            {essaysData && essaysData.list.length > 0 && (
                <EssayTimeline essays={essaysData.list} />
            )}
        </div>
    );
}
