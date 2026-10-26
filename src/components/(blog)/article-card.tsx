import Link from "next/link";
import Image from "next/image";

import type { PostItem } from "@/types/articles";
import { cn, resolveAssetUrl } from "@/lib/utils";

function formatDate(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
}

/**
 * 主色标签的文字颜色（官方 FeedArticleCard.getContrastColor 的等价实现）：
 * 亮度阈值 180，只有很浅的底色才用深色字，其余用白字。
 */
function getContrastColor(color: string): string {
    if (color.startsWith("var(")) return "#ffffff";
    const hex = color.replace("#", "");
    if (hex.length !== 6) return "#ffffff";
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    if ([r, g, b].some((v) => Number.isNaN(v))) return "#ffffff";
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 180 ? "#333333" : "#ffffff";
}

/** 只接受看起来像颜色值的字符串，其余（空值/脏数据）回退默认标签样式 */
function normalizePrimaryColor(color?: string | null): string | null {
    const value = (color ?? "").trim();
    if (!value) return null;
    return /^(#[0-9a-fA-F]{3,8}|rgb|hsl|oklch|var\()/.test(value) ? value : null;
}

interface ArticleCardProps {
    article: PostItem;
    /** 站点默认封面（post.default.cover）：文章自身无封面时兜底 */
    defaultCover?: string | null;
    /** 分类标签使用文章主色（post.default.enable_primary_color_tag） */
    enablePrimaryColorTag?: boolean;
}

export function ArticleCard({ article, defaultCover, enablePrimaryColorTag = false }: ArticleCardProps) {
    // 封面优先级：文章封面 > 站点默认封面（对齐官方「文章封面 > 配置默认封面」）
    const cover = resolveAssetUrl(article.cover_url || article.top_img_url) || defaultCover || null;
    const summary = article.summaries?.[0];
    // 主色标签：仅在后端给了合法颜色值时才覆盖默认样式，避免脏数据把标签弄成透明
    const primaryColor = enablePrimaryColorTag ? normalizePrimaryColor(article.primary_color) : null;

    return (
        <Link
            href={`/posts/${article.id}`}
            className="group flex flex-col overflow-hidden rounded-lg border bg-card shadow-sm transition-shadow hover:shadow-md"
        >
            {cover && (
                <div className="relative aspect-[16/9] w-full overflow-hidden bg-muted">
                    {/* 封面走 next/image：列表页一屏好几张图，优化器能按视口给 webp + 合适尺寸。
                        fill + sizes 让它在 1 列/2 列/3 列布局下都取到接近真实的宽度。 */}
                    <Image
                        src={cover}
                        alt={article.title}
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        className="object-cover transition-transform duration-300 group-hover:scale-105"
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
                            <span
                                key={c.id}
                                className={cn(
                                    "rounded px-1.5 py-px text-[11px]",
                                    // 开启主色标签后由行内样式接管配色，不再用默认的 accent 底色
                                    !primaryColor && "bg-accent text-accent-foreground"
                                )}
                                style={
                                    primaryColor
                                        ? { backgroundColor: primaryColor, color: getContrastColor(primaryColor) }
                                        : undefined
                                }
                            >
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
