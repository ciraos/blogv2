import type { Metadata } from "next";

import { HomeTop } from "@/components/(blog)/home-top";
import { PagedArticleList } from "@/components/(blog)/paged-article-list";

import { getPublicArticlesApi, getPublicSiteConfigApi } from "@/lib/api";
import { generateBlogMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata();
}

const PAGE_SIZE = 10;

export default async function Home({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
    const { page: pageRaw } = await searchParams;
    const page = Math.max(1, parseInt(pageRaw ?? "1", 10) || 1);

    const [config, { list, total }] = await Promise.all([
        getPublicSiteConfigApi().catch(() => null),
        getPublicArticlesApi({ page, pageSize: PAGE_SIZE }),
    ]);

    return (
        <div className="w-full space-y-12">
            {/* 首页顶部 HOME_TOP：站点标题 + 分类快捷入口 + 新品 banner（config.HOME_TOP） */}
            <HomeTop homeTop={config?.HOME_TOP} />

            <PagedArticleList
                articles={list}
                total={total}
                page={page}
                pageSize={PAGE_SIZE}
                makePageHref={(p) => `/?page=${p}`}
            />
        </div>
    );
}
