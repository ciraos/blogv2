import type { Metadata } from "next";
import Link from "next/link";

import { PagedArticleList } from "@/components/(blog)/paged-article-list";

import { getAllPublicArticlesApi, getPublicArticlesApi } from "@/lib/api";
import { collectTags } from "@/lib/articles";
import { generateBlogMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("标签");
}

const PAGE_SIZE = 10;

interface TagsSearchParams {
    name?: string | string[];
    page?: string;
}

export default async function TagsPage({ searchParams }: { searchParams: Promise<TagsSearchParams> }) {
    const sp = await searchParams;
    const name = typeof sp.name === "string" ? sp.name.trim() : "";
    const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

    // ===== 某标签下的文章列表 =====
    if (name) {
        const { list, total } = await getPublicArticlesApi({ page, pageSize: PAGE_SIZE, tag: name });
        return (
            <div className="w-full space-y-4">
                <div className="flex items-baseline justify-between gap-4">
                    <h1 className="text-2xl font-bold tracking-tight">标签：# {name}</h1>
                    <Link href="/tags" className="shrink-0 text-sm text-muted-foreground hover:underline">
                        ← 全部标签
                    </Link>
                </div>
                <PagedArticleList
                    articles={list}
                    total={total}
                    page={page}
                    pageSize={PAGE_SIZE}
                    makePageHref={(p) => `/tags?name=${encodeURIComponent(name)}&page=${p}`}
                    emptyText="该标签暂无文章"
                />
            </div>
        );
    }

    // ===== 全部标签（含文章数） =====
    const articles = await getAllPublicArticlesApi();
    const tags = collectTags(articles);

    return (
        <div className="w-full space-y-6">
            <h1 className="text-2xl font-bold tracking-tight">全部标签</h1>
            {tags.length === 0 ? (
                <p className="py-16 text-center text-muted-foreground">暂无标签</p>
            ) : (
                <div className="flex flex-wrap gap-2">
                    {tags.map((tag) => (
                        <Link
                            key={tag.id}
                            href={`/tags?name=${encodeURIComponent(tag.name)}`}
                            className="group rounded-full border px-3 py-1 transition-colors hover:border-primary"
                        >
                            <span className="text-sm group-hover:text-primary">#{tag.name}</span>
                            <span className="ml-1.5 text-xs text-muted-foreground">{tag.count}</span>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
