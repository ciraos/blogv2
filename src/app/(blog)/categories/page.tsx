import type { Metadata } from "next";
import Link from "next/link";

import { PagedArticleList } from "@/components/(blog)/paged-article-list";

import { getAllPublicArticlesApi, getPublicArticlesApi } from "@/lib/api";
import { collectCategories } from "@/lib/articles";
import { generateBlogMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("分类");
}

const PAGE_SIZE = 10;

interface CategoriesSearchParams {
    name?: string | string[];
    page?: string;
}

export default async function CategoriesPage({ searchParams }: { searchParams: Promise<CategoriesSearchParams> }) {
    const sp = await searchParams;
    const name = typeof sp.name === "string" ? sp.name.trim() : "";
    const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

    // ===== 某分类下的文章列表 =====
    if (name) {
        const { list, total } = await getPublicArticlesApi({ page, pageSize: PAGE_SIZE, category: name });
        return (
            <div className="w-full space-y-4">
                <div className="flex items-baseline justify-between gap-4">
                    <h1 className="text-2xl font-bold tracking-tight">分类：{name}</h1>
                    <Link href="/categories" className="shrink-0 text-sm text-muted-foreground hover:underline">
                        ← 全部分类
                    </Link>
                </div>
                <PagedArticleList
                    articles={list}
                    total={total}
                    page={page}
                    pageSize={PAGE_SIZE}
                    makePageHref={(p) => `/categories?name=${encodeURIComponent(name)}&page=${p}`}
                    emptyText="该分类暂无文章"
                />
            </div>
        );
    }

    // ===== 全部分类（含文章数） =====
    const articles = await getAllPublicArticlesApi();
    const categories = collectCategories(articles);

    return (
        <div className="w-full space-y-6">
            <h1 className="text-2xl font-bold tracking-tight">全部分类</h1>
            {categories.length === 0 ? (
                <p className="py-16 text-center text-muted-foreground">暂无分类</p>
            ) : (
                <div className="flex flex-wrap gap-3">
                    {categories.map((category) => (
                        <Link
                            key={category.id}
                            href={`/categories?name=${encodeURIComponent(category.name)}`}
                            className="group rounded-lg border px-4 py-2 transition-colors hover:border-primary"
                        >
                            <span className="text-sm font-medium group-hover:text-primary">{category.name}</span>
                            <span className="ml-2 text-xs text-muted-foreground">{category.count} 篇</span>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
