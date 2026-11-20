import Link from "next/link";
import Image from "next/image";

import type { PostItem } from "@/types/articles";
import { formatPostDate, toPlainSummary, resolvePostCover } from "@/lib/post-display";

/** 只接受看起来像颜色值的字符串，其余（空值/脏数据）回退默认样式 */
export function normalizePrimaryColor(color?: string | null): string | null {
    const value = (color ?? "").trim();
    if (!value) return null;
    return /^(#[0-9a-fA-F]{3,8}|rgb|hsl|oklch|var\()/.test(value) ? value : null;
}

interface ArticleCardGridProps {
    article: PostItem;
    /** 站点默认封面（post.default.cover）：文章自身无封面时兜底 */
    defaultCover?: string | null;
    /** 分类 / 标签使用文章主色（post.default.enable_primary_color_tag） */
    enablePrimaryColorTag?: boolean;
    /** 首屏首张图给 priority，避免 LCP 拖慢 */
    priority?: boolean;
}

/**
 * 文章列表项 · 双列网格变体（后台 post.default.double_column 打开时用）。
 *
 * 和行式的 `ArticleCard` 的区别只在版式：封面在上（16:9，比行式的 112px 缩略图更有分量），
 * 下面是标题（2 行）、摘要（2 行）、元信息。数据口径与行式完全一致：
 * 封面兜底、置顶标记、分类/标签去重、主色标签都走同一套。
 */
export function ArticleCardGrid({ article, defaultCover, enablePrimaryColorTag = false, priority = false }: ArticleCardGridProps) {
    const cover = resolvePostCover(article, defaultCover);
    const summary = toPlainSummary(article.summaries?.[0]);
    const primaryColor = enablePrimaryColorTag ? normalizePrimaryColor(article.primary_color) : null;
    // 分类和标签常常同名（`ANHEYU-APP` / `#ANHEYU-APP`），同一行里说两遍等于噪音
    const categoryNames = new Set(article.post_categories.map((c) => c.name.trim().toLowerCase()));
    const tags = article.post_tags.filter((t) => !categoryNames.has(t.name.trim().toLowerCase()));

    return (
        <Link
            href={`/posts/${article.id}`}
            className="group flex h-full flex-col overflow-hidden rounded-[var(--surface-r)] border border-border/60 bg-card transition-[transform,box-shadow,border-color] duration-300 ease-out hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_14px_36px_-22px_rgba(0,0,0,0.45)] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
        >
            <div className="relative aspect-[16/9] w-full overflow-hidden bg-muted">
                <Image
                    src={cover}
                    alt={article.title}
                    fill
                    priority={priority}
                    sizes="(min-width: 640px) 46vw, 92vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:group-hover:scale-100"
                />
                {article.pin_sort > 0 && (
                    <span className="absolute left-2.5 top-2.5 rounded-full bg-background/85 px-2 py-0.5 text-[10px] leading-none font-medium text-foreground backdrop-blur-sm">
                        置顶
                    </span>
                )}
            </div>

            <div className="flex min-h-0 flex-1 flex-col p-4">
                <h2 className="editorial-serif line-clamp-2 text-[15.5px] leading-snug font-semibold transition-colors group-hover:text-primary">
                    {article.title}
                </h2>

                {summary && (
                    <p className="mt-2 line-clamp-2 text-[12.5px] leading-relaxed text-muted-foreground">{summary}</p>
                )}

                <div className="mt-auto flex flex-wrap items-center gap-x-2.5 gap-y-1 pt-3 text-[11px] text-muted-foreground">
                    <time className="font-mono tabular-nums">{formatPostDate(article.created_at)}</time>
                    {article.post_categories.map((c) => (
                        <span
                            key={c.id}
                            className={primaryColor ? undefined : "text-foreground/70"}
                            style={primaryColor ? { color: primaryColor } : undefined}
                        >
                            {c.name}
                        </span>
                    ))}
                    {tags.map((t) => (
                        <span
                            key={t.id}
                            className={primaryColor ? undefined : "text-foreground/70"}
                            style={primaryColor ? { color: primaryColor, opacity: 0.85 } : undefined}
                        >
                            #{t.name}
                        </span>
                    ))}
                    <span className="tabular-nums">阅读 {article.view_count}</span>
                    {article.reading_time > 0 && <span className="tabular-nums">{article.reading_time} 分钟</span>}
                </div>
            </div>
        </Link>
    );
}

/**
 * 文章列表容器：双列网格（≥640px 两列，更宽仍两列 —— 内容区约 960px，
 * 三列会把标题挤到一行两三个字）。
 */
export function ArticleGrid({ children }: { children: React.ReactNode }) {
    return <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">{children}</div>;
}
