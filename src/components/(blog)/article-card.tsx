import Link from "next/link";

import type { PostItem } from "@/types/articles";
import { resolveAssetUrl } from "@/lib/utils";

function formatDate(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export function ArticleCard({ article }: { article: PostItem }) {
    const cover = resolveAssetUrl(article.cover_url || article.top_img_url);
    const summary = article.summaries?.[0];

    return (
        <Link
            href={`/posts/${article.id}`}
            className="group flex flex-col overflow-hidden rounded-lg border bg-card shadow-sm transition-shadow hover:shadow-md"
        >
            {cover && (
                <div className="relative aspect-[16/9] w-full overflow-hidden bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={cover}
                        alt={article.title}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        loading="lazy"
                    />
                </div>
            )}

            <div className="flex flex-1 flex-col gap-1.5 p-3">
                <div className="flex items-center gap-1.5">
                    {article.pin_sort > 0 && (
                        <span className="rounded-full bg-primary px-1.5 py-px text-[10px] text-primary-foreground">置顶</span>
                    )}
                    <h2 className="line-clamp-2 text-sm font-semibold leading-snug group-hover:text-primary">
                        {article.title}
                    </h2>
                </div>

                {summary && <p className="line-clamp-2 text-xs text-muted-foreground">{summary}</p>}

                <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-0.5 pt-1 text-[11px] text-muted-foreground">
                    <span>{formatDate(article.created_at)}</span>
                    <span>阅读 {article.view_count}</span>
                    {article.reading_time > 0 && <span>{article.reading_time} 分钟</span>}
                    {article.word_count > 0 && <span>{article.word_count} 字</span>}
                </div>

                {(article.post_tags.length > 0 || article.post_categories.length > 0) && (
                    <div className="flex flex-wrap gap-1 pt-0.5">
                        {article.post_categories.map((c) => (
                            <span key={c.id} className="rounded bg-accent px-1.5 py-px text-[11px] text-accent-foreground">
                                {c.name}
                            </span>
                        ))}
                        {article.post_tags.map((t) => (
                            <span key={t.id} className="rounded bg-muted px-1.5 py-px text-[11px] text-muted-foreground">
                                #{t.name}
                            </span>
                        ))}
                    </div>
                )}
            </div>
        </Link>
    );
}
