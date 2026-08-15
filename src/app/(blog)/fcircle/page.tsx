import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpDown } from "lucide-react";

import { MomentCard } from "@/components/(blog)/moment-card";
import { NumberedPagination } from "@/components/(blog)/numbered-pagination";

import { ApiError, getPublicMomentsApi } from "@/lib/api";
import { generateBlogMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("朋友圈");
}

const PAGE_SIZE = 20;

interface FcircleSearchParams {
    page?: string;
    sort_type?: string;
}

export default async function FcirclePage({ searchParams }: { searchParams: Promise<FcircleSearchParams> }) {
    const sp = await searchParams;
    const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
    // 排序：published_at（发布时间，默认）/ created_at（抓取时间）
    const sortType = sp.sort_type === "created_at" ? "created_at" : "published_at";

    let data;
    let errorMessage: string | null = null;
    try {
        data = await getPublicMomentsApi({ page, page_size: PAGE_SIZE, sort_type: sortType });
    } catch (err) {
        errorMessage = err instanceof ApiError ? err.message : "网络请求失败";
        data = null;
    }

    // 空态 / 错误态
    if (!data || data.list.length === 0) {
        return (
            <div className="w-full space-y-6">
                <h1 className="text-2xl font-bold tracking-tight">朋友圈</h1>
                <p className="py-16 text-center text-sm text-muted-foreground">
                    {errorMessage ? `暂时无法获取内容：${errorMessage}` : "暂无内容，敬请期待"}
                </p>
            </div>
        );
    }

    const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
    const stats = data.statistics;
    // 分页链接保留排序参数
    const pageHref = (p: number) =>
        `/fcircle?${sortType !== "published_at" ? `sort_type=${sortType}&` : ""}page=${p}`;

    return (
        <div className="w-full space-y-6">
            <header>
                <h1 className="text-2xl font-bold tracking-tight">朋友圈</h1>
                {/* 统计 + 排序按钮（最右侧） */}
                <div className="mt-1 flex items-center justify-between gap-4">
                    <p className="text-sm text-muted-foreground">
                        {stats
                            ? `${stats.active_links} 个活跃友链 · ${stats.total_moments} 篇动态`
                            : `共 ${data.total} 篇动态`}
                    </p>
                    <Link
                        href={sortType === "published_at" ? "/fcircle?sort_type=created_at" : "/fcircle?sort_type=published_at"}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
                    >
                        <ArrowUpDown className="size-3.5" />
                        {sortType === "published_at" ? "按发布时间" : "按抓取时间"}
                    </Link>
                </div>
            </header>

            {/* 网格：严格从左到右、逐行排列（最新在前） */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {data.list.map((moment) => (
                    <MomentCard key={moment.id} moment={moment} />
                ))}
            </div>

            <NumberedPagination page={page} totalPages={totalPages} makePageHref={pageHref} />
        </div>
    );
}
