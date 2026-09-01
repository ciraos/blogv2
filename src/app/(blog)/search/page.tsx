import type { Metadata } from "next";
import Link from "next/link";

import { NumberedPagination } from "@/components/(blog)/numbered-pagination";

import { ApiError, searchArticlesApi, type SearchHit } from "@/lib/api";
import { generateBlogMetadata } from "@/lib/seo";
import { resolveAssetUrl } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("搜索");
}

const PAGE_SIZE = 10;

interface SearchSearchParams {
    q?: string;
    page?: string;
}

function formatDate(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
}

/** 单个搜索结果项（文章/文档/相册等） */
function SearchResultItem({ hit }: { hit: SearchHit }) {
    const isPost = hit.type === "post" || (!hit.type && !hit.is_doc);
    const href = isPost ? `/posts/${hit.id}` : hit.url || `/posts/${hit.id}`;
    const cover = resolveAssetUrl(hit.cover_url);

    return (
        <Link
            href={href}
            className="group flex flex-col gap-2 rounded-lg border bg-card p-4 shadow-sm transition-shadow hover:shadow-md sm:flex-row sm:items-start"
        >
            {cover && (
                <div className="h-24 w-full shrink-0 overflow-hidden rounded-md bg-muted sm:w-36">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={cover}
                        alt={hit.title}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                </div>
            )}
            <div className="min-w-0 flex-1">
                <h2 className="line-clamp-2 text-base font-semibold leading-snug group-hover:text-primary">
                    {hit.title}
                </h2>
                {hit.snippet && (
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{hit.snippet}</p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
                    {hit.author && <span>{hit.author}</span>}
                    {hit.category && <span>{hit.category}</span>}
                    {hit.publish_date && <span>{formatDate(hit.publish_date)}</span>}
                    {hit.view_count > 0 && <span>阅读 {hit.view_count}</span>}
                    {hit.reading_time > 0 && <span>{hit.reading_time} 分钟</span>}
                </div>
                {hit.tags.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                        {hit.tags.map((tag) => (
                            <span key={tag} className="rounded bg-muted px-1.5 py-px text-[11px] text-muted-foreground">
                                #{tag}
                            </span>
                        ))}
                    </div>
                )}
            </div>
        </Link>
    );
}

export default async function Search({ searchParams }: { searchParams: Promise<SearchSearchParams> }) {
    const sp = await searchParams;
    const q = (sp.q ?? "").trim();
    const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

    // 无关键词：展示搜索提示
    if (!q) {
        return (
            <div className="w-full space-y-6">
                <h1 className="text-2xl font-bold tracking-tight">搜索</h1>
                <p className="py-16 text-center text-sm text-muted-foreground">
                    输入关键词搜索站内文章、页面等内容。
                </p>
            </div>
        );
    }

    // 执行搜索
    let data: Awaited<ReturnType<typeof searchArticlesApi>>;
    let errorMessage: string | null = null;
    try {
        data = await searchArticlesApi({ q, page, size: PAGE_SIZE });
    } catch (err) {
        errorMessage = err instanceof ApiError ? err.message : "网络请求失败";
        data = { pagination: { total: 0, page, size: PAGE_SIZE, totalPages: 1 }, hits: [] };
    }

    const { hits, pagination } = data;
    const total = pagination?.total ?? 0;
    const totalPages = Math.max(1, pagination?.totalPages ?? 1);

    return (
        <div className="w-full space-y-6">
            <header>
                <h1 className="text-2xl font-bold tracking-tight">搜索</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    关键词「{q}」共找到 {total} 条结果
                </p>
            </header>

            {errorMessage ? (
                <p className="py-16 text-center text-sm text-muted-foreground">
                    搜索失败：{errorMessage}
                </p>
            ) : hits.length === 0 ? (
                <p className="py-16 text-center text-sm text-muted-foreground">
                    没有找到与「{q}」相关的内容，换个关键词试试吧。
                </p>
            ) : (
                <>
                    <div className="space-y-3">
                        {hits.map((hit) => (
                            <SearchResultItem key={hit.id} hit={hit} />
                        ))}
                    </div>
                    <NumberedPagination
                        page={page}
                        totalPages={totalPages}
                        makePageHref={(p) => `/search?q=${encodeURIComponent(q)}&page=${p}`}
                    />
                </>
            )}
        </div>
    );
}
