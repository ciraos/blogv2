import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";

import { ArticleBody } from "@/components/(blog)/article-body";
import { ArticleSummary } from "@/components/(blog)/article-summary";
import { JsonLd } from "@/components/(blog)/json-ld";
import { PostActions } from "@/components/(blog)/post-actions";
import { PostComments } from "@/components/(blog)/post-comments";
import { PostWaves } from "@/components/(blog)/post-waves";
import { PageWithSidebar } from "@/components/(blog)/page-with-sidebar";

import { ApiError, getCommentsWithChildrenApi, getPublicArticleApi } from "@/lib/api";
import { patchArticleContent } from "@/lib/article-shortcodes";
import { getCommentAuthor } from "@/lib/comment-author";
import { renderCopyrightHtml, type ArticleCopyCopyrightConfig } from "@/lib/post-copyright";
import { requireSiteConfigs } from "@/lib/site-config";
import { splitKeywords } from "@/lib/seo";
import { articleSchema, breadcrumbSchema } from "@/lib/structured-data";
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
        const description = article.summaries?.[0] || article.keywords || undefined;

        // 关键词：文章自带（中/英文逗号、分号分隔）优先；为空时回退站点 SITE_KEYWORDS
        const articleKeywords = splitKeywords(article.keywords);

        // 分享图：文章封面优先；无封面时回退站点 LOGO/图标
        let shareImage = resolveAssetUrl(article.cover_url || article.top_img_url);
        let siteName: string | undefined;
        let keywords: string[] | undefined;
        // 仅在「无封面」或「无文章关键词」时才拉站点配置（一次拿全回退数据）
        if (!shareImage || articleKeywords.length === 0) {
            try {
                const config = await requireSiteConfigs();
                if (!shareImage) shareImage = resolveAssetUrl(config.LOGO_URL_512x512 || config.LOGO_URL || config.ICON_URL);
                siteName = config.APP_NAME || undefined;
                if (articleKeywords.length === 0) keywords = splitKeywords(config.SITE_KEYWORDS);
            } catch {
                // 配置获取失败：省略分享图/关键词兜底
            }
        }
        if (keywords === undefined && articleKeywords.length > 0) keywords = articleKeywords;

        return {
            title: article.title,
            description,
            keywords,
            openGraph: {
                type: "article",
                siteName,
                title: article.title,
                description,
                publishedTime: article.created_at,
                modifiedTime: article.updated_at,
                ...(shareImage ? { images: [{ url: shareImage }] } : {}),
            },
            twitter: {
                card: "summary_large_image",
                title: article.title,
                description,
                ...(shareImage ? { images: [shareImage] } : {}),
            },
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
    /** 转载文章走转载模板/转载追加文案（官方口径：is_reprint === true） */
    const isReprint = article.is_reprint === true;

    // 站点配置（版权块/打赏/订阅/分享/复制追加版权）：服务端取数后通过 props 传入客户端组件
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
        /** 版权声明 HTML（post.copyright.*_template 渲染结果，占位符已替换） */
        copyrightHtml: string;
    } | null = null;
    // 复制正文时的版权配置（post.copy.*）；null = 配置没取到，客户端不拦截也不追加
    let copyCopyright: ArticleCopyCopyrightConfig | null = null;
    try {
        const config = await requireSiteConfigs();
        // 作者名兜底链照官方 PostCopyright/index.tsx 的顺序，但去掉 owner_name 那一级：
        // 后端公开文章接口只返回 owner_nickname（无 owner_name，实测 2026-10），所以是 昵称 → 前台站长名 → 站点名 → 博主
        const authorName = article.owner_nickname || config.frontDesk?.siteOwner?.name || config.APP_NAME || "博主";
        const siteUrl = config.SITE_URL ?? "/";
        actionsConfig = {
            siteName: config.APP_NAME ?? "博客",
            author: authorName,
            subtitle: config.SUB_TITLE ?? "",
            siteUrl,
            userAvatar: resolveAssetUrl(config.USER_AVATAR),
            icp: config.ICP_NUMBER ?? "",
            showRewardButton: config.post?.copyright?.show_reward_button ?? true,
            showSubscribeButton: config.post?.copyright?.show_subscribe_button ?? true,
            showShareButton: config.post?.copyright?.show_share_button ?? true,
            // 版权模板：配置为空时回退官方默认模板（等价于此前的写死文案）
            copyrightHtml: renderCopyrightHtml({
                originalTemplate: config.post?.copyright?.original_template,
                reprintTemplateWithUrl: config.post?.copyright?.reprint_template_with_url,
                reprintTemplateWithoutUrl: config.post?.copyright?.reprint_template_without_url,
                isReprint,
                copyrightAuthor: article.copyright_author,
                copyrightUrl: article.copyright_url,
                author: authorName,
                siteUrl,
            }),
        };
        copyCopyright = {
            // 官方语义：post.copy.enable=false 表示「不允许复制文章内容」，缺省不拦截
            enable: config.post?.copy?.enable !== false,
            copyrightEnable: config.post?.copy?.copyright_enable === true,
            copyrightOriginal: config.post?.copy?.copyright_original ?? "",
            copyrightReprint: config.post?.copy?.copyright_reprint ?? "",
            siteName: config.APP_NAME || "本站",
            // 复制追加文案的 {author} 官方取 frontDesk.siteOwner.name（与版权块的 {author} 不是同一个值）
            author: config.frontDesk?.siteOwner?.name || "博主",
            isReprint,
            copyrightAuthor: article.copyright_author ?? "",
            copyrightUrl: article.copyright_url ?? "",
        };
    } catch {
        // 配置获取失败时不渲染版权块、不做复制拦截（不阻塞文章正文）
        actionsConfig = null;
    }

    // 代码块配置（mac 风格 / 超过多少行折叠）：取自 site-config post.code_block（后端 snake_case → 前端 camelCase）
    let codeBlock: { codeMaxLines: number; macStyle: boolean } | undefined;
    try {
        const config = await requireSiteConfigs();
        const cb = config.post?.code_block;
        if (cb) {
            codeBlock = { codeMaxLines: cb.code_max_lines, macStyle: cb.mac_style };
        }
    } catch {
        // 配置获取失败时使用默认（不阻塞正文）
    }

    // 正文结尾的装饰波浪开关（site-config post.waves.enable）。
    // 上面几次拿配置都走 lib/site-config 里被 React `cache()` 包住的实现，同一次渲染只会真正请求一次。
    let wavesEnabled = false;
    try {
        const config = await requireSiteConfigs();
        wavesEnabled = config.post?.waves?.enable === true;
    } catch {
        // 配置获取失败时不渲染波浪（纯装饰，不能影响正文）
    }

    // 评论区：按 target_path 获取本文章评论 + 子评论（博主回复等），失败时降级为空列表
    const targetPath = `/posts/${article.id}`;
    const comments = await getCommentsWithChildrenApi(targetPath);

    /**
     * 正文 HTML 补丁（src/lib/article-shortcodes.ts）：后端**收下但忽略**短代码的一部分参数，
     * 这里按 content_md 把它们补回 HTML。该页同时拿得到 content_md 与 content_html，所以补丁放在服务端；
     * 两处数量对不上时函数内部会整体放弃并 console.warn（宁可保持后端原样，也不部分乱改）。
     *   - `{btn ...}`：layout/position（实测 hKw5：26 条可渲染短代码对应 26 个 `<a class="btn-anzhiyu">`，
     *     但 `btn-container` 0 个，块级按钮全被包在普通 `<p>` 里）→ 补类名与块级容器；
     *   - `{tip ...}`：theme/position/delay（实测同样 14 条短代码对应 14 个 `.anzhiyu-tip-wrapper`，
     *     后端只透传了 `theme=light` / `position=bottom` / `trigger=click`，成功/信息/警告/错误四档、
     *     左/右两个方向、`delay=0/500` 全丢）→ 补 `tip-{theme}` / `tip-{position}` 类名与 wrapper 上的
     *     `data-trigger` / `data-delay`。tip 的显示/隐藏/延迟机制仍在 globals.css + article-body.tsx:enhanceTips。
     */
    const contentHtml = patchArticleContent(article.content_md, article.content_html || "");

    /* ---------- 结构化数据（JSON-LD）----------
     * BlogPosting + BreadcrumbList：让搜索结果能出「标题/时间/作者/缩略图」的富摘要。
     * URL 必须是绝对地址，优先用站点配置的 SITE_URL，取不到退回构建期 env。
     */
    const siteBase = (actionsConfig?.siteUrl || process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/+$/, "");
    const toAbsolute = (value?: string | null): string | undefined => {
        if (!value) return undefined;
        if (/^https?:\/\//i.test(value)) return value;
        return `${siteBase}${value.startsWith("/") ? "" : "/"}${value}`;
    };
    const postUrl = `${siteBase}/posts/${article.id}`;
    const postDescription = article.summaries?.[0] || article.keywords || undefined;
    const structuredData = [
        articleSchema({
            title: article.title,
            description: postDescription,
            url: postUrl,
            image: toAbsolute(cover),
            datePublished: article.created_at,
            dateModified: article.updated_at || article.created_at,
            authorName: actionsConfig?.author || article.owner_nickname || "博主",
            publisherName: actionsConfig?.siteName || "博客",
            publisherLogo: toAbsolute(actionsConfig?.userAvatar),
            keywords: splitKeywords(article.keywords),
            section: article.post_categories?.[0]?.name,
            wordCount: article.word_count,
        }),
        breadcrumbSchema([
            { name: "首页", url: `${siteBase}/` },
            { name: "文章", url: `${siteBase}/posts` },
            { name: article.title, url: postUrl },
        ]),
    ];

    return (
        <PageWithSidebar>
            {/* 单栏文章正文；右侧目录（TOC）由全局侧边栏顶部的「文章目录」卡片接管 */}
            {/* 编辑部风：正文页收成 720px 沉浸阅读宽度（左侧留白均匀），文章内的 Markdown 样式不动 */}
            <article className="mx-auto w-full min-w-0 max-w-[720px]">
                <JsonLd data={structuredData} />
                {cover ? (
                    /* 封面大图：文章信息叠加在图上，底部渐变遮罩保证文字清晰 */
                    <header className="relative overflow-hidden">
                        {/* 封面大图：整块 header 是定位容器，图用 fill 铺满；priority 因为它是首屏最大的图 */}
                        <Image
                            src={cover}
                            alt={article.title}
                            fill
                            priority
                            sizes="(max-width: 1024px) 100vw, 60vw"
                            className="object-cover"
                        />
                        {/* 渐变遮罩：底部最暗 → 顶部渐明，确保标题/元信息在浅色图上也可读 */}
                        <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/40 to-black/20" />
                        <div className="relative flex min-h-60 flex-col justify-end p-5 md:min-h-76 md:p-8">
                            <h1 className="post-title text-2xl font-bold leading-snug tracking-tight text-white drop-shadow-sm md:text-3xl">
                                {article.title}
                            </h1>
                            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/80">
                                <span>发布于 {formatDate(article.created_at)}</span>
                                {article.ip_location && <span>· {article.ip_location}</span>}
                                <span>· 阅读 {article.view_count}</span>
                                {article.reading_time > 0 && <span>· {article.reading_time} 分钟</span>}
                                {article.word_count > 0 && <span>· {article.word_count} 字</span>}
                            </div>
                            {(article.post_tags.length > 0 || article.post_categories.length > 0) && (
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {article.post_categories.map((c) => (
                                        <span key={c.id} className="rounded-md bg-black/40 px-2 py-0.5 text-xs text-white backdrop-blur-sm">
                                            {c.name}
                                        </span>
                                    ))}
                                    {article.post_tags.map((t) => (
                                        <span key={t.id} className="rounded-md bg-black/30 px-2 py-0.5 text-xs text-white/90 backdrop-blur-sm">
                                            #{t.name}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    </header>
                ) : (
                    /* 无封面图：回退为普通文章头部 */
                    <header className="space-y-3 border-b pb-6">
                        <h1 className="post-title text-2xl font-bold leading-snug tracking-tight md:text-3xl">{article.title}</h1>
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
                )}

                {/* 文章摘要（后台「摘要 & SEO」里的 summaries，可用 AI 生成）：标题之下、正文之前。
                    没有摘要时组件自己返回 null，不会留空档。 */}
                <ArticleSummary summaries={article.summaries} />

                {/* 后端渲染好的正文 HTML，客户端组件负责代码块高亮 + 复制按钮；正文白底卡片，深浅色随主题切换 */}
                <div className="mt-8 border-t border-border/60 pt-8">
                    <ArticleBody html={contentHtml} codeBlock={codeBlock} copyCopyright={copyCopyright} />
                </div>

                {/* 正文结尾的装饰波浪（post.waves.enable）：纯装饰，不影响正文排版 */}
                {wavesEnabled && <PostWaves />}

                {/* 文章末尾：版权信息 + 打赏 / 订阅 / 分享（配置由服务端从 site-config 获取） */}
                {actionsConfig && (
                    <PostActions {...actionsConfig} title={article.title} url={`/posts/${article.id}`} />
                )}

                {/* 上一篇 / 下一篇（放在评论区上方） */}
                {(prev || next) && (
                    <nav className="mt-10 grid grid-cols-1 gap-0 border-t border-border/60 pt-2 sm:grid-cols-2">
                        {prev ? (
                            <Link href={`/posts/${prev.id}`} className="group border-t border-border/60 py-3 transition-colors">
                                <div className="text-xs text-muted-foreground">← 上一篇</div>
                                <div className="mt-1 line-clamp-1 text-sm font-medium group-hover:text-primary">{prev.title}</div>
                            </Link>
                        ) : (
                            <span />
                        )}
                        {next && (
                            <Link href={`/posts/${next.id}`} className="group border-t border-border/60 py-3 text-right transition-colors sm:border-t-0 sm:border-l sm:pl-5">
                                <div className="text-xs text-muted-foreground">下一篇 →</div>
                                <div className="mt-1 line-clamp-1 text-sm font-medium group-hover:text-primary">{next.title}</div>
                            </Link>
                        )}
                    </nav>
                )}

                {/* 评论区（评论列表由服务端按 target_path 获取；已登录时作者信息取自账号） */}
                <PostComments targetPath={targetPath} comments={comments} author={await getCommentAuthor()} />

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
        </PageWithSidebar>
    );
}
