import Image from "next/image";
import Link from "next/link";

import type { PostItem } from "@/types/articles";
import { formatPostDate, resolvePostCover, toPlainSummary } from "@/lib/post-display";

interface HomeLeadStoryProps {
    article: PostItem;
    /** 站点默认封面（post.default.cover）：文章自身无封面时兜底 */
    defaultCover?: string | null;
}

/**
 * 首页头条：把最新一篇提成这一屏的「封面故事」。
 *
 * 左边日期、标题、摘要、元信息，右边一张真实封面 —— 整屏唯一的彩色块就在这里，
 * 下面的目录行保持安静（这是 slop 与 craft 的分界：颜色收进一两处内容，
 * 而不是撒在按钮、标签、边框上）。
 *
 * 没有封面时不摆空槽：文字通栏，靠字号和双线撑起版面。
 */
export function HomeLeadStory({ article, defaultCover }: HomeLeadStoryProps) {
    const cover = resolvePostCover(article, defaultCover);
    const summary = toPlainSummary(article.summaries?.[0]);
    // 分类和标签常常同名（`ANHEYU-APP` / `#ANHEYU-APP`），同一行里说两遍等于噪音
    const categoryNames = new Set(article.post_categories.map((c) => c.name.trim().toLowerCase()));
    const tags = article.post_tags.filter((t) => !categoryNames.has(t.name.trim().toLowerCase()));

    return (
        <article className="pb-10">
            <Link
                href={`/posts/${article.id}`}
                className={
                    cover
                        ? "group flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-10"
                        : "group block"
                }
            >
                <div className="min-w-0 flex-1">
                    <p className="flex items-baseline gap-2 font-mono text-[11px] tabular-nums text-muted-foreground">
                        <span>{formatPostDate(article.created_at)}</span>
                        <span aria-hidden>·</span>
                        <span>头条</span>
                    </p>

                    <h2 className="editorial-serif mt-3 text-2xl leading-[1.25] font-bold transition-colors group-hover:text-primary sm:text-3xl">
                        {article.title}
                    </h2>

                    {summary && (
                        <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{summary}</p>
                    )}

                    <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                        {article.post_categories.map((c) => (
                            <span key={c.id}>{c.name}</span>
                        ))}
                        {tags.map((t) => (
                            <span key={t.id}>#{t.name}</span>
                        ))}
                        <span className="tabular-nums">{article.view_count} 阅读</span>
                        {article.reading_time > 0 && <span className="tabular-nums">{article.reading_time} 分钟</span>}
                    </div>
                </div>

                {cover && (
                    <div className="relative aspect-[3/2] w-full shrink-0 overflow-hidden rounded-[6px] border border-border/60 sm:w-[360px]">
                        <Image
                            src={cover}
                            alt={article.title}
                            fill
                            sizes="(max-width: 640px) 100vw, 360px"
                            className="object-cover"
                            priority
                        />
                    </div>
                )}
            </Link>
        </article>
    );
}
