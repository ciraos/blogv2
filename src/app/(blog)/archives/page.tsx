import type { Metadata } from "next";
import Link from "next/link";

import { PagedArticleList } from "@/components/(blog)/paged-article-list";

import { getPublicArchivesApi, getPublicArticlesApi } from "@/lib/api";
import { generateBlogMetadata } from "@/lib/seo";
import type { PostItem } from "@/types/articles";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("归档");
}

const PAGE_SIZE = 10;
const MONTH_PAGE_SIZE = 50;

function formatDay(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}

interface ArchivesSearchParams {
    year?: string;
    month?: string;
    page?: string;
}

export default async function Archives({ searchParams }: { searchParams: Promise<ArchivesSearchParams> }) {
    const sp = await searchParams;
    const year = Number.parseInt(sp.year ?? "", 10);
    const month = Number.parseInt(sp.month ?? "", 10);
    const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

    // ===== 归档索引：竖向时间轴（年份/月份节点 + 文章，上下排序） =====
    if (Number.isNaN(year)) {
        const { list } = await getPublicArchivesApi();
        const sorted = [...list].sort((a, b) => b.year - a.year || b.month - a.month);

        // 每个月份拉取该月文章
        const withArticles = await Promise.all(
            sorted.map(async (item) => ({
                ...item,
                articles: (
                    await getPublicArticlesApi({
                        year: item.year,
                        month: item.month,
                        pageSize: MONTH_PAGE_SIZE,
                    })
                ).list,
            }))
        );

        const byYear = new Map<number, { year: number; months: { month: number; articles: PostItem[] }[] }>();
        for (const item of withArticles) {
            const group = byYear.get(item.year) ?? { year: item.year, months: [] };
            group.months.push({ month: item.month, articles: item.articles });
            byYear.set(item.year, group);
        }
        const years = [...byYear.values()];

        return (
            <div className="w-full space-y-8">
                <h1 className="text-2xl font-bold tracking-tight">归档</h1>
                {years.length === 0 ? (
                    <p className="py-16 text-center text-muted-foreground">暂无归档</p>
                ) : (
                    <div className="space-y-8">
                        {years.map((group) => (
                            <section key={group.year}>
                                {/* 年份节点 */}
                                <h2 className="flex items-center gap-2.5 text-lg font-semibold">
                                    <span className="size-2.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                                    {group.year} 年
                                </h2>

                                {/* 月份 + 文章（缩进 + 时间线） */}
                                <div className="ml-1.5 mt-4 space-y-5 border-l border-border pl-6">
                                    {group.months.map((m) => (
                                        <div key={m.month}>
                                            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                                <span className="size-2 shrink-0 rounded-full border-2 border-primary bg-background" aria-hidden="true" />
                                                {m.month} 月（{m.articles.length} 篇）
                                            </div>
                                            <ul className="mt-2 space-y-2">
                                                {m.articles.map((article) => (
                                                    <li key={article.id} className="flex items-baseline gap-2.5">
                                                        <span className="w-11 shrink-0 text-xs tabular-nums text-muted-foreground">
                                                            {formatDay(article.created_at)}
                                                        </span>
                                                        <Link
                                                            href={`/posts/${article.id}`}
                                                            className="truncate text-sm transition-colors hover:text-primary hover:underline"
                                                        >
                                                            {article.title}
                                                        </Link>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        ))}
                    </div>
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
