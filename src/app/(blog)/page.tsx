import type { Metadata } from "next";

import { PagedArticleList } from "@/components/(blog)/paged-article-list";

import { getPublicArticlesApi } from "@/lib/api";
import { generateBlogMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata();
}

const PAGE_SIZE = 10;

export default async function Home({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
    const { page: pageRaw } = await searchParams;
    const page = Math.max(1, parseInt(pageRaw ?? "1", 10) || 1);

    const { list, total } = await getPublicArticlesApi({ page, pageSize: PAGE_SIZE });

    return (
        <PagedArticleList
            articles={list}
            total={total}
            page={page}
            pageSize={PAGE_SIZE}
            makePageHref={(p) => `/?page=${p}`}
        />
    );
}
