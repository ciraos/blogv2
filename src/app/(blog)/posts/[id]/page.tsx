import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ArticleBody } from "@/components/(blog)/article-body";
import { PostActions } from "@/components/(blog)/post-actions";
import { PostComments } from "@/components/(blog)/post-comments";

import { ApiError, getCommentsWithChildrenApi, getPublicArticleApi, getPublicSiteConfigApi } from "@/lib/api";
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

export default async function Post({ params }: PostPageProps) {
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

    // 站点配置（版权块/打赏/订阅/分享）：服务端取数后通过 props 传入客户端组件
    let actionsConfig: {
        siteName: string;
        author: string;
        subtitle: string;
        siteUrl: string;
        userAvatar: string | null;
        icp: string;
        showRewardButton: boolean;
        showSubscribeButton: boolean;
        showShareButton: boolean;
    } | null = null;
    try {
        const config = await getPublicSiteConfigApi();
        actionsConfig = {
            siteName: config.APP_NAME ?? "博客",
            author: article.owner_nickname || config.APP_NAME || "博主",
            subtitle: config.SUB_TITLE ?? "",
            siteUrl: config.SITE_URL ?? "/",
            userAvatar: resolveAssetUrl(config.USER_AVATAR),
            icp: config.ICP_NUMBER ?? "",
            showRewardButton: config.post?.copyright?.show_reward_button ?? true,
            showSubscribeButton: config.post?.copyright?.show_subscribe_button ?? true,
            showShareButton: config.post?.copyright?.show_share_button ?? true,
        };
    } catch {
        // 配置获取失败时不渲染版权块（不阻塞文章正文）
        actionsConfig = null;
    }

    // 代码块配置（mac 风格 / 超过多少行折叠）：取自 site-config post.code_block（后端 snake_case → 前端 camelCase）
    let codeBlock: { codeMaxLines: number; macStyle: boolean } | undefined;
    try {
        const config = await getPublicSiteConfigApi();
        const cb = config.post?.code_block;
        if (cb) {
            codeBlock = { codeMaxLines: cb.code_max_lines, macStyle: cb.mac_style };
        }
    } catch {
        // 配置获取失败时使用默认（不阻塞正文）
    }

    // 评论区：按 target_path 获取本文章评论 + 子评论（博主回复等），失败时降级为空列表
    const targetPath = `/posts/${article.id}`;
    const comments = await getCommentsWithChildrenApi(targetPath);

    return (
        /* 单栏文章正文；右侧目录（TOC）由全局侧边栏顶部的「文章目录」卡片接管 */
        <article className="min-w-0">
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
                    <div className="mt-6 h-52 overflow-hidden rounded-xl border md:h-72">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={cover} alt={article.title} className="h-full w-full object-cover" />
                    </div>
                )}

                {/* 后端渲染好的正文 HTML，客户端组件负责代码块高亮 + 复制按钮；正文白底卡片，深浅色随主题切换 */}
                <div className="mt-6 rounded-xl border border-border/60 bg-card p-5 shadow-sm md:p-8">
                    <ArticleBody html={article.content_html || ""} codeBlock={codeBlock} />
                </div>

                {/* 文章末尾：版权信息 + 打赏 / 订阅 / 分享（配置由服务端从 site-config 获取） */}
                {actionsConfig && (
                    <PostActions {...actionsConfig} title={article.title} url={`/posts/${article.id}`} />
                )}

                {/* 上一篇 / 下一篇（放在评论区上方） */}
                {(prev || next) && (
                    <nav className="mt-10 grid grid-cols-1 gap-3 border-none pt-6 sm:grid-cols-2">
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

                {/* 评论区（评论列表由服务端按 target_path 获取） */}
                <PostComments targetPath={targetPath} comments={comments} />

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
