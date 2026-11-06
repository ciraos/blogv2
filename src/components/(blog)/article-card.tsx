import Link from "next/link";
import Image from "next/image";

import type { PostItem } from "@/types/articles";
import { resolveAssetUrl } from "@/lib/utils";

/** yyyy.MM.dd —— 编辑部风列表的日期列用等宽数字，不做本地化长格式 */
function formatDate(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

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
 * 行与行之间用发丝分割线。这样首页不会堆成圆角卡片墙，也便于扫读标题。
 */
export function ArticleCard({ article, defaultCover, enablePrimaryColorTag = false }: ArticleCardProps) {
    // 封面优先级：文章封面 > 站点默认封面
    const cover = resolveAssetUrl(article.cover_url || article.top_img_url) || defaultCover || null;
    const summary = article.summaries?.[0];
    const primaryColor = enablePrimaryColorTag ? normalizePrimaryColor(article.primary_color) : null;

    return (
        <Link
            href={`/posts/${article.id}`}
            className="group grid grid-cols-[60px_minmax(0,1fr)] items-start gap-x-5 border-b border-border/60 py-6 transition-colors last:border-b-0 sm:grid-cols-[76px_minmax(0,1fr)_104px]"
        >
            <time className="pt-1.5 font-mono text-[11px] tracking-wider text-muted-foreground/80 tabular-nums transition-colors group-hover:text-primary">
                {formatDate(article.created_at)}
            </time>

            <div className="min-w-0">
                <div className="flex items-start gap-2">
                    {article.pin_sort > 0 && (
                        <span className="mt-1 shrink-0 border border-primary/40 px-1.5 py-px text-[10px] tracking-wider text-primary">
                            置顶
                        </span>
                    )}
                    <h2 className="editorial-serif line-clamp-2 text-lg leading-snug font-semibold transition-colors group-hover:text-primary group-hover:underline group-hover:decoration-primary/40 group-hover:underline-offset-4">
                        {article.title}
                    </h2>
                </div>

                {summary && (
                    <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{summary}</p>
                )}

                <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] tracking-[0.14em] text-muted-foreground/80 uppercase">
                    {article.post_categories.map((c) => (
                        <span key={c.id} className={primaryColor ? undefined : "text-primary"} style={primaryColor ? { color: primaryColor } : undefined}>
                            {c.name}
                        </span>
                    ))}
                    {article.post_tags.map((t) => (
                        <span key={t.id}>#{t.name}</span>
                    ))}
                    <span className="tabular-nums">阅读 {article.view_count}</span>
                    {article.reading_time > 0 && <span>{article.reading_time} 分钟</span>}
                </div>
            </div>

            {cover && (
                <div className="relative mt-0.5 hidden aspect-[3/2] w-[104px] overflow-hidden rounded-lg sm:block">
                    <Image
                        src={cover}
                        alt={article.title}
                        fill
                        sizes="104px"
                        className="object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                </div>
            )}
        </Link>
    );
}
