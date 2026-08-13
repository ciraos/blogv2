import type { Metadata } from "next";
import Link from "next/link";

import { PagedArticleList } from "@/components/(blog)/paged-article-list";

import { getPublicArchivesApi, getPublicArticlesApi } from "@/lib/api";
import { generateBlogMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("归档");
}

const PAGE_SIZE = 10;

interface ArchivesSearchParams {
    year?: string;
    month?: string;
    page?: string;
}

export default async function ArchivesPage({ searchParams }: { searchParams: Promise<ArchivesSearchParams> }) {
    const sp = await searchParams;
    const year = Number.parseInt(sp.year ?? "", 10);
    const month = Number.parseInt(sp.month ?? "", 10);
    const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

    // ===== 归档索引：按年分组展示月份 =====
    if (Number.isNaN(year)) {
        const { list } = await getPublicArchivesApi();

        const byYear = new Map<number, { year: number; months: { month: number; count: number }[] }>();
        for (const item of list) {
            const group = byYear.get(item.year) ?? { year: item.year, months: [] };
            group.months.push({ month: item.month, count: item.count });
            byYear.set(item.year, group);
        }
        const years = [...byYear.values()].sort((a, b) => b.year - a.year);

        return (
            <div className="w-full space-y-8">
                <h1 className="text-2xl font-bold tracking-tight">归档</h1>
                {years.length === 0 ? (
                    <p className="py-16 text-center text-muted-foreground">暂无归档</p>
                ) : (
                    years.map((group) => (
                        <section key={group.year}>
                            <h2 className="text-lg font-semibold">{group.year} 年</h2>
                            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                                {group.months
                                    .sort((a, b) => b.month - a.month)
                                    .map((m) => (
                                        <Link
                                            key={m.month}
                                            href={`/archives?year=${group.year}&month=${m.month}`}
                                            className="rounded-lg border p-3 transition-colors hover:border-primary"
                                        >
                                            <div className="text-sm font-medium">{m.month} 月</div>
                                            <div className="mt-1 text-xs text-muted-foreground">{m.count} 篇</div>
                                        </Link>
                                    ))}
                            </div>
                        </section>
                    ))
                )}
            </div>
        );
    }

    // ===== 按年月筛选的文章列表 =====
    const validMonth = Number.isNaN(month) ? undefined : month;
    const { list, total } = await getPublicArticlesApi({
        page,
        pageSize: PAGE_SIZE,
        year,
        month: validMonth,
    });
    const title = `${year} 年${validMonth ? ` ${validMonth} 月` : ""}`;

    return (
        <div className="w-full space-y-4">
            <div className="flex items-baseline justify-between gap-4">
                <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
                <Link href="/archives" className="shrink-0 text-sm text-muted-foreground hover:underline">
                    ← 全部归档
                </Link>
            </div>
            <PagedArticleList
                articles={list}
                total={total}
                page={page}
                pageSize={PAGE_SIZE}
                makePageHref={(p) =>
                    `/archives?year=${year}${validMonth ? `&month=${validMonth}` : ""}&page=${p}`
                }
                emptyText="该时间段暂无文章"
            />
        </div>
    );
}
