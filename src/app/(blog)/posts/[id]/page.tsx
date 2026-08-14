import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ArticleBody } from "@/components/(blog)/article-body";

import { ApiError, getPublicArticleApi } from "@/lib/api";
import { resolveAssetUrl } from "@/lib/utils";

interface PostPageProps {
    params: Promise<{ id: string }>;
}

function formatDate(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" });
}

export async function generateMetadata({ params }: PostPageProps): Promise<Metadata> {
    try {
        const { id } = await params;
        const article = await getPublicArticleApi(id);
        return {
            title: article.title,
            description: article.summaries?.[0] || article.keywords || undefined,
        };
    } catch {
        return {};
    }
}

export default async function PostPage({ params }: PostPageProps) {
    const { id } = await params;

    let article: Awaited<ReturnType<typeof getPublicArticleApi>>;
    try {
        article = await getPublicArticleApi(id);
    } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
            notFound();
        }
        throw err;
    }

    const cover = resolveAssetUrl(article.cover_url || article.top_img_url);
    const prev = article.prev_article;
    const next = article.next_article;

    return (
        <article className="w-full">
            <header className="space-y-3 border-b pb-6">
                <h1 className="text-2xl font-bold leading-snug tracking-tight md:text-3xl">{article.title}</h1>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                    <span>发布于 {formatDate(article.created_at)}</span>
                    {article.ip_location && <span>· {article.ip_location}</span>}
                    <span>· 阅读 {article.view_count}</span>
                    {article.reading_time > 0 && <span>· {article.reading_time} 分钟</span>}
                    {article.word_count > 0 && <span>· {article.word_count} 字</span>}
                </div>

                {(article.post_tags.length > 0 || article.post_categories.length > 0) && (
                    <div className="flex flex-wrap gap-2 pt-1">
                        {article.post_categories.map((c) => (
                            <span key={c.id} className="rounded-md bg-accent px-2 py-0.5 text-xs text-accent-foreground">
                                {c.name}
                            </span>
                        ))}
                        {article.post_tags.map((t) => (
                            <span key={t.id} className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                                #{t.name}
                            </span>
                        ))}
                    </div>
                )}
            </header>

            {cover && (
                <div className="mt-6 overflow-hidden rounded-xl border">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={cover} alt={article.title} className="h-auto w-full object-cover" />
                </div>
            )}

            {/* 后端渲染好的正文 HTML，客户端组件负责代码块高亮 + 复制按钮 */}
            <ArticleBody html={article.content_html || ""} />

            {(prev || next) && (
                <nav className="mt-10 grid gap-3 border-t pt-6 sm:grid-cols-2">
                    {prev ? (
                        <Link href={`/posts/${prev.id}`} className="group rounded-lg border p-3 transition-colors hover:border-primary">
                            <div className="text-xs text-muted-foreground">← 上一篇</div>
                            <div className="mt-1 line-clamp-1 text-sm font-medium group-hover:text-primary">{prev.title}</div>
                        </Link>
                    ) : (
                        <span />
                    )}
                    {next && (
                        <Link href={`/posts/${next.id}`} className="group rounded-lg border p-3 text-right transition-colors hover:border-primary">
                            <div className="text-xs text-muted-foreground">下一篇 →</div>
                            <div className="mt-1 line-clamp-1 text-sm font-medium group-hover:text-primary">{next.title}</div>
                        </Link>
                    )}
                </nav>
            )}

            {article.related_articles.length > 0 && (
                <section className="mt-10 border-t pt-6">
                    <h2 className="text-lg font-semibold">相关文章</h2>
                    <ul className="mt-3 space-y-2">
                        {article.related_articles.map((related) => (
                            <li key={related.id}>
                                <Link href={`/posts/${related.id}`} className="text-sm text-primary hover:underline">
                                    {related.title}
                                </Link>
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </article>
    );
}
