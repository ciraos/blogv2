import Link from "next/link";
import Image from "next/image";

import type { PostItem } from "@/types/articles";
import { formatPostDate, toPlainSummary, resolvePostCover } from "@/lib/post-display";

/** 只接受看起来像颜色值的字符串，其余（空值/脏数据）回退默认样式 */
function normalizePrimaryColor(color?: string | null): string | null {
    const value = (color ?? "").trim();
    if (!value) return null;
    return /^(#[0-9a-fA-F]{3,8}|rgb|hsl|oklch|var\()/.test(value) ? value : null;
}

interface ArticleCardProps {
    article: PostItem;
    /** 站点默认封面（post.default.cover）：文章自身无封面时兜底 */
    defaultCover?: string | null;
    /** 分类使用文章主色（post.default.enable_primary_color_tag） */
    enablePrimaryColorTag?: boolean;
}

/**
 * 文章列表项（编辑部风）。
 *
 * 不是卡片：一条一条排下来，左边日期列、中间标题+摘要+元信息、右侧小缩略图，
 * 行与行之间用发丝分割线。这样列表不会堆成圆角卡片墙，也便于扫读标题。
 *
 * 元信息这一行刻意「不喊」：取消全大写字距（中文没有大小写，那只是把小字撑散），
 * 分类和同名标签去重，数字统一等宽。颜色只在分类上（且后台开了主色标签时），
 * 其余一律走次级灰 —— 首页的强调色留给刊头的期号印记。
 */
export function ArticleCard({ article, defaultCover, enablePrimaryColorTag = false }: ArticleCardProps) {
    // 封面优先级：文章封面 > 站点默认封面
    // 文章没封面 → 站点默认封面 → 内置默认封面，任何一篇文章都有图
    const cover = resolvePostCover(article, defaultCover);
    const summary = toPlainSummary(article.summaries?.[0]);
    const primaryColor = enablePrimaryColorTag ? normalizePrimaryColor(article.primary_color) : null;
    // 分类和标签常常同名（`ANHEYU-APP` / `#ANHEYU-APP`），同一行里说两遍等于噪音
    const categoryNames = new Set(article.post_categories.map((c) => c.name.trim().toLowerCase()));
    const tags = article.post_tags.filter((t) => !categoryNames.has(t.name.trim().toLowerCase()));

    return (
        <Link
            href={`/posts/${article.id}`}
            className="group grid grid-cols-[64px_minmax(0,1fr)] items-start gap-x-5 border-b border-border/60 py-6 transition-colors last:border-b-0 sm:grid-cols-[80px_minmax(0,1fr)_112px]"
        >
            <time className="pt-1 font-mono text-[11px] tabular-nums text-muted-foreground transition-colors group-hover:text-foreground">
                {formatPostDate(article.created_at)}
            </time>

            <div className="min-w-0">
                <div className="flex items-start gap-2">
                    {article.pin_sort > 0 && (
                        <span className="mt-1 shrink-0 border border-border px-1.5 py-px text-[10px] leading-none text-muted-foreground">
                            置顶
                        </span>
                    )}
                    <h2 className="editorial-serif line-clamp-2 text-[17px] leading-snug font-semibold transition-colors group-hover:text-primary group-hover:underline group-hover:decoration-primary/40 group-hover:underline-offset-4">
                        {article.title}
                    </h2>
                </div>

                {summary && (
                    <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">{summary}</p>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
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
                        <span key={t.id}>#{t.name}</span>
                    ))}
                    <span className="tabular-nums">阅读 {article.view_count}</span>
                    {article.reading_time > 0 && <span className="tabular-nums">{article.reading_time} 分钟</span>}
                </div>
            </div>

            {cover && (
                <div className="relative mt-0.5 hidden aspect-[3/2] w-[112px] overflow-hidden rounded-[6px] border border-border/60 sm:block">
                    <Image src={cover} alt={article.title} fill sizes="112px" className="object-cover" />
                </div>
            )}
        </Link>
    );
}
