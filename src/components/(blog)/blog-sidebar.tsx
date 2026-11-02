import Link from "next/link";
import { headers } from "next/headers";
import {
    ArrowRight,
    CalendarDays,
    Clock,
    FileText,
    MegaphoneIcon,
    MessageSquare,
    Tag as TagIcon,
} from "lucide-react";
import { CollapsibleAside } from "@/components/(blog)/collapsible-aside";
import { CommentAvatar } from "@/components/(blog)/comment-avatar";
import { PostToc } from "@/components/(blog)/post-toc";
import { AuthorGreeting } from "@/components/(blog)/author-greeting";
import { Icon } from "@/components/ui/icon";
import { collectTags } from "@/lib/articles";
import { getLatestCommentsApi, getPublicArticlesApi, type RecentComment } from "@/lib/api";
import { getAllPublicArticlesCached, getPublicArchivesCached } from "@/lib/public-content-cache";
import { resolveCommentAvatar, type GravatarConfig } from "@/lib/avatar";
import { resolveAssetUrl } from "@/lib/utils";
import type { SiteConfig } from "@/types/site-config";

/** 站点建站天数（按最新文章日期估算） */
function daysSince(createdAt?: string): number {
    if (!createdAt) return 0;
    const start = new Date(createdAt).getTime();
    if (Number.isNaN(start)) return 0;
    return Math.max(1, Math.floor((Date.now() - start) / 86400000));
}

/** 作者信息卡（头像 / 名字 / 描述 / 技能 / 社交） */
function AuthorCard({ config }: { config: SiteConfig }) {
    const author = config.sidebar?.author;
    const avatar = resolveAssetUrl(config.USER_AVATAR);

    return (
        <div className="overflow-hidden rounded-xl bg-linear-to-br from-primary/90 to-primary shadow-sm">
            <div className="p-5 text-primary-foreground">
                {/* 顶部问候语：默认「欢迎光临」，点击循环显示技能词 */}
                {author?.skills && author.skills.length > 0 ? (
                    <AuthorGreeting skills={author.skills} />
                ) : (
                    <div className="w-fit m-auto py-0.5 px-2 text-left text-3 text-white bg-[#fff3] opacity-80 select-none rounded-[12xl] hover:cursor-pointer">欢迎光临</div>
                )}

                {/* 头像区：悬浮时头像缩小消失，原位淡入铺满宽度的描述文字 */}
                {avatar && author?.description && (
                    <div className="group relative mx-auto mt-4 flex w-full cursor-pointer items-center justify-center">
                        {/* 头像（含状态图标）：悬浮时缩小消失（自定义类 author-avatar-hover，见 globals.css） */}
                        <div className="author-avatar-hover relative transition-all duration-500">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={avatar}
                                alt={config.APP_NAME || "头像"}
                                loading="lazy"
                                className="size-24 rounded-full border-[5px] border-white object-cover"
                            />
                            {author.statusImg && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                    src={author.statusImg}
                                    alt="状态"
                                    loading="lazy"
                                    className="absolute -bottom-1 -right-1 size-8 rounded-full bg-white object-contain"
                                />
                            )}
                        </div>

                        {/* 悬浮时覆盖显示描述（铺满容器宽度，淡入） */}
                        <div
                            className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-2 text-center text-[11px] leading-relaxed opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                            dangerouslySetInnerHTML={{ __html: author.description }}
                        />
                    </div>
                )}

                <Link href="/about" className="mt-4 block text-center">
                    {/* 名字取 frontDesk.siteOwner.name（官方 AuthorInfoCard 的 ownerName 口径），
                        缺省才回退站点名 APP_NAME */}
                    <div className="text-xl font-bold tracking-tight">
                        {config.frontDesk?.siteOwner?.name || config.APP_NAME || "博客"}
                    </div>
                    <div className="mt-1 text-xs opacity-75">{config.SUB_TITLE || ""}</div>
                </Link>
            </div>

            {/* 技能标签：已并入顶部问候语点击循环，不再单独展示 */}

            {/* 社交图标 */}
            {author?.social && Object.keys(author.social).length > 0 && (
                <div className="flex flex-col gap-2 border-t border-white/15 px-4 py-3">
                    {Object.entries(author.social).map(([name, item]) => (
                        <a
                            key={name}
                            href={item.link}
                            target="_blank"
                            rel="noopener noreferrer nofollow"
                            title={name}
                            className="w-20 flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs text-slate-300 transition-colors hover:bg-white/25"
                        >
                            <Icon name={item.icon} className="text-sm leading-none" />
                            {name}
                        </a>
                    ))}
                </div>
            )}
        </div>
    );
}

/** 公告卡：标题固定「公告」，正文「欢迎来到 站点名 的博客呀！」。
 *  站点名取 site-config 的 APP_NAME（不写死；线上当前为「葱苓小筑」）；
 *  APP_NAME 为空时兜底「本站」——否则会渲染成「欢迎来到的博客呀！」这种缺主语的残句。
 *  图标沿用 (blog)/layout.tsx 公告条同款 MegaphoneIcon，样式与相邻卡头一致（size-4 + text-primary）。
 *  min-w-0 + break-words：站点名很长或含无空格长串时在卡内换行，移动端不会横向撑破卡片。 */
function AnnouncementCard({ appName }: { appName?: string }) {
    const siteName = appName?.trim() || "本站";

    return (
        <div className="rounded-xl border bg-card p-5 shadow-sm">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
                <MegaphoneIcon className="size-4 text-primary" aria-hidden />
                公告
            </h3>
            {/* 站点名用 JSX 插值拼接（不做字符串替换），文案改动只影响这一处。
                前后留白用 mx-0.5（用户指定，0.125rem = 2px 左右外边距）而不是源码里敲空格：
                JSX 会把标签与文本之间的换行+缩进折叠掉，写空格容易被吃掉；
                外边距由 CSS 决定，视觉留白稳定且不受空白折叠影响。
                配色只用主题令牌 text-primary（换肤自动跟随，不硬编码颜色）：与卡头图标同一令牌，
                深浅色对比度已实测（浅色 4.70:1 / 深色 6.66:1，见截图与报告）。 */}
            <p className="mt-3 min-w-0 break-words text-sm leading-relaxed text-foreground/90">
                欢迎来到
                <span className="mx-0.5 font-medium text-primary">{siteName}</span>
                的博客呀！
            </p>
        </div>
    );
}

/** 原「文档链接」卡（DocLinksCard / DocLinkIcon / DocLinkItem）已按用户要求换成上面的公告卡；
 *  sidebar.doc.links 配置键仍然后端/设置页存在，但前台不再消费（需要时按 git 历史取回实现）。 */

/** 微信卡片（sidebar.wechat）：底层模糊背景图 + 正面二维码；
 *  悬浮时 3D 翻转看背面（纯 CSS：group-hover + preserve-3d，不需要客户端组件）；
 *  link 非空时整卡可点，新窗口打开（官方 CardWechat 同口径）。 */
function WechatCard({
    face,
    backFace,
    blurBackground,
    link,
}: {
    face: string;
    backFace: string;
    blurBackground: string;
    link?: string;
}) {
    const faceStyle = { backgroundImage: `url(${face})`, backgroundSize: "100%" };
    const backFaceStyle = { backgroundImage: `url(${backFace})`, backgroundSize: "100%" };

    const inner = (
        <>
            {/* 模糊背景：悬浮时下滑淡出（官方 CardWechat 的 ::before 行为） */}
            {blurBackground && (
                <div
                    className="absolute inset-0 bg-cover bg-center transition-all duration-300 group-hover:translate-y-full group-hover:opacity-0"
                    style={{ backgroundImage: `url(${blurBackground})` }}
                />
            )}
            <div className="relative z-[1] h-[110px] w-[235px] [perspective:1000px]">
                <div className="h-full w-full transition-transform duration-300 [transform-style:preserve-3d] group-hover:[transform:rotateY(180deg)]">
                    {/* 正面 */}
                    <div className="absolute inset-0 bg-center bg-no-repeat [backface-visibility:hidden]" style={faceStyle} />
                    {/* 背面（预先翻转 180°，正面朝外时正好背对视线） */}
                    <div
                        className="absolute inset-0 bg-center bg-no-repeat [backface-visibility:hidden] [transform:rotateY(180deg)]"
                        style={backFaceStyle}
                    />
                </div>
            </div>
        </>
    );

    const shell =
        "group relative flex h-[110px] items-center justify-center overflow-hidden rounded-xl border bg-[#57bd6a] shadow-sm dark:bg-[#121121]";

    if (!link) return <div className={shell}>{inner}</div>;

    return (
        <a href={link} target="_blank" rel="noopener noreferrer nofollow" title="微信公众号" className={shell}>
            {inner}
        </a>
    );
}

interface CustomSidebarBlock {
    title: string;
    content: string;
    showInPost: boolean;
}

/** 解析 CUSTOM_SIDEBAR（类型是 unknown[]，官方结构 { title, content, showInPost? }，最多 3 块）。
 *  后端可能直接给数组，也可能给 JSON 字符串（官方 parseCustomBlocks 兼容两种），空值返回 []。 */
function parseCustomSidebarBlocks(raw: unknown): CustomSidebarBlock[] {
    let value: unknown = raw;
    if (typeof raw === "string") {
        const trimmed = raw.trim();
        if (!trimmed || trimmed === "[]") return [];
        try {
            value = JSON.parse(trimmed);
        } catch {
            return []; // 结构不认识就整体不渲染，避免把脏数据当 HTML 塞进页面
        }
    }
    if (!Array.isArray(value)) return [];
    // 显式标成 unknown[]（Array.isArray 会把 unknown 收窄成 any[]，这里不给隐式 any 留口子）
    const list = value as unknown[];

    return list
        .filter((block): block is Record<string, unknown> => typeof block === "object" && block !== null)
        .map((block) => ({
            title: typeof block.title === "string" ? block.title : "",
            content: typeof block.content === "string" ? block.content : "",
            // 官方口径：showInPost 缺省 = true（文章页也显示）
            showInPost: block.showInPost === undefined ? true : Boolean(block.showInPost),
        }))
        .filter((block) => block.content.trim().length > 0);
}

/** 自定义侧边栏块（CUSTOM_SIDEBAR）：按后台顺序渲染，标题可空。
 *  注意：这是服务端渲染的 HTML，静态标签正常显示，但 <script> 不会执行
 *  （官方是客户端组件里手动重放 script），需要脚本的自定义块请另作安排。 */
function CustomSidebarCard({ blocks }: { blocks: CustomSidebarBlock[] }) {
    if (blocks.length === 0) return null;

    return (
        <>
            {blocks.map((block, index) => (
                <div key={`${block.title}-${index}`} className="rounded-xl border bg-card p-5 shadow-sm">
                    {block.title && <h3 className="text-sm font-semibold">{block.title}</h3>}
                    <div
                        className={`text-sm leading-relaxed text-foreground/90 ${block.title ? "mt-3" : ""}`}
                        dangerouslySetInnerHTML={{ __html: block.content }}
                    />
                </div>
            ))}
        </>
    );
}

/** 标签云（highlight 里的标签用主色高亮，与其余标签区分） */
async function TagsCard({ highlight }: { highlight?: string[] }) {
    let tags: ReturnType<typeof collectTags> = [];
    try {
        const articles = await getAllPublicArticlesCached();
        tags = collectTags(articles).slice(0, 20);
    } catch {
        // 忽略，标签获取失败时隐藏卡片
    }
    if (tags.length === 0) return null;

    // 配置里的高亮名单（去空白后按名字精确匹配；后端标签名可能带空格，故两边都 trim）
    const highlighted = new Set((highlight ?? []).map((name) => name.trim()).filter(Boolean));

    return (
        <div className="rounded-xl border bg-card p-5 shadow-sm">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
                <TagIcon className="size-4 text-primary" />
                标签
            </h3>
            <div className="mt-3 flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                    <Link
                        key={tag.id}
                        href={`/tags?name=${encodeURIComponent(tag.name)}`}
                        className={
                            highlighted.has(tag.name.trim())
                                // 高亮：主色实底 + 主色前景，深浅色都由主题令牌决定
                                ? "rounded-full bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
                                : "rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-primary hover:text-primary-foreground"
                        }
                    >
                        {tag.name}
                        <sup className="ml-0.5">{tag.count}</sup>
                    </Link>
                ))}
            </div>
        </div>
    );
}

/** 最近文章：标题（超长省略）+ 发布日期，点击进入文章详情 */
async function RecentPostsCard({ count }: { count?: number }) {
    // 条数兜底 5（配置缺失或非正数时）
    const limit = typeof count === "number" && count > 0 ? count : 5;

    let posts: Awaited<ReturnType<typeof getPublicArticlesApi>>["list"] = [];
    try {
        const data = await getPublicArticlesApi({ pageSize: limit });
        posts = data.list ?? [];
    } catch {
        // 忽略，获取失败时隐藏卡片
    }
    if (posts.length === 0) return null;

    const formatDate = (iso: string) => {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return "";
        return d.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
    };

    return (
        <div className="rounded-xl border bg-card p-5 shadow-sm">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Clock className="size-4 text-primary" />
                最近文章
            </h3>
            <ul className="mt-3 space-y-2.5">
                {posts.map((post) => (
                    <li key={post.id}>
                        <Link href={`/posts/${post.id}`} className="group block">
                            <span className="block truncate text-sm text-foreground/90 transition-colors group-hover:text-primary">
                                {post.title}
                            </span>
                            <span className="mt-0.5 block text-[11px] text-muted-foreground">
                                {formatDate(post.created_at)}
                            </span>
                        </Link>
                    </li>
                ))}
            </ul>
        </div>
    );
}

/** 归档（按年月） */
async function ArchivesCard({ displayMonths = 6 }: { displayMonths?: number }) {
    let items: { year: number; month: number; count: number }[] = [];
    try {
        const data = await getPublicArchivesCached();
        items = data.list ?? [];
    } catch {
        // 忽略
    }
    if (items.length === 0) return null;

    const shown = displayMonths > 0 ? items.slice(0, displayMonths) : items;
    const formatMonth = (year: number, month: number) => `${year} 年 ${month} 月`;

    return (
        <div className="rounded-xl border bg-card p-5 shadow-sm">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
                <CalendarDays className="size-4 text-primary" />
                归档
            </h3>
            <ul className="mt-3 space-y-1">
                {shown.map((item) => (
                    <li key={`${item.year}-${item.month}`}>
                        <Link
                            href={`/archives?year=${item.year}&month=${item.month}`}
                            className="flex items-center justify-between rounded-none p-0 text-sm transition-colors hover:bg-muted"
                        >
                            <span className="text-muted-foreground">{formatMonth(item.year, item.month)}</span>
                            <span className="text-xs text-muted-foreground">
                                {item.count} 篇
                            </span>
                        </Link>
                    </li>
                ))}
            </ul>
            <Link href="/archives" className="mt-2 flex items-center gap-0 text-xs text-primary hover:underline">
                查看全部归档
                <ArrowRight className="size-3" />
            </Link>
        </div>
    );
}

/** 最近评论：左侧头像 + 右侧评论内容，点击跳转到对应文章评论区（#post-comment 锚点） */
async function RecentCommentsCard({ limit = 5, gravatar }: { limit?: number; gravatar?: GravatarConfig }) {
    let comments: RecentComment[] = [];
    try {
        const data = await getLatestCommentsApi({ page: 1, pageSize: limit });
        comments = data.list ?? [];
    } catch {
        // 忽略，获取失败时隐藏卡片
    }
    if (comments.length === 0) return null;

    /** content 为空时从 content_html 剥离标签取纯文本 */
    const stripHtml = (html?: string): string => {
        if (!html) return "";
        return html
            .replace(/<br\s*\/?>/gi, " ")
            .replace(/<\/p>/gi, " ")
            .replace(/<[^>]+>/g, "")
            .replace(/\s+/g, " ")
            .trim();
    };

    return (
        <div className="rounded-xl border bg-card p-5 shadow-sm">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
                <MessageSquare className="size-4 text-primary" />
                最近评论
            </h3>
            <ul className="mt-3 space-y-2.5">
                {comments.map((comment) => {
                    // 头像口径与评论区一致：avatar_url 优先，否则按站点 GRAVATAR_URL + DEFAULT_GRAVATAR_TYPE 拼
                    const avatar = resolveCommentAvatar(comment, gravatar);
                    // 跳转到对应文章评论区（文章详情页评论区锚点为 #post-comment）
                    const href = comment.target_path
                        ? `${comment.target_path}#post-comment`
                        : undefined;
                    const content = comment.content || stripHtml(comment.content_html);

                    return (
                        <li key={comment.id}>
                            <Link
                                href={href ?? "#"}
                                className="group flex items-start gap-2.5"
                            >
                                {/* 左侧头像：地址永远有值（无邮箱时由 d= 生成兜底头像）；加载失败退化首字头像 */}
                                <CommentAvatar
                                    src={avatar}
                                    name={comment.nickname}
                                    className="size-8 shrink-0 rounded-full border object-cover"
                                />

                                {/* 右侧评论内容 */}
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-baseline gap-1.5">
                                        <span className="max-w-[45%] truncate text-xs font-medium">
                                            {comment.nickname || "匿名"}
                                            {comment.is_admin_comment && (
                                                <span className="ml-1 rounded bg-primary px-1 py-px text-[10px] text-primary-foreground">站长</span>
                                            )}
                                        </span>
                                        <span className="truncate text-[11px] text-muted-foreground">
                                            {comment.target_title || comment.target_path}
                                        </span>
                                    </div>
                                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-foreground/90 transition-colors group-hover:text-primary">
                                        {content}
                                    </p>
                                </div>
                            </Link>
                        </li>
                    );
                })}
            </ul>
            <Link href="/recentcomments" className="mt-3 flex items-center gap-0 text-xs text-primary hover:underline">
                查看全部评论
                <ArrowRight className="size-3" />
            </Link>
        </div>
    );
}

/** 站点信息（文章数 / 字数 / 建站天数） */
function SiteInfoCard({
    totalPostCount,
    totalWordCount,
    runtimeEnable,
    createdAt,
}: {
    totalPostCount?: number;
    totalWordCount?: number;
    runtimeEnable?: boolean;
    createdAt?: string;
}) {
    const days = daysSince(createdAt);

    return (
        <div className="rounded-xl border bg-card p-5 shadow-sm">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
                <FileText className="size-4 text-primary" />
                网站信息
            </h3>
            <div className="mt-3 grid grid-cols-1 gap-0 text-sm">
                {totalPostCount != null && (
                    <div className="flex items-center justify-between rounded-lg px-0 py-1.5">
                        <span className="text-muted-foreground">文章总数</span>
                        <span className="font-medium">{totalPostCount}</span>
                    </div>
                )}
                {totalWordCount != null && (
                    <div className="flex items-center justify-between rounded-lg px-0 py-1.5">
                        <span className="text-muted-foreground">全站字数</span>
                        <span className="font-medium">{totalWordCount.toLocaleString()}</span>
                    </div>
                )}
                {runtimeEnable && days > 0 && (
                    <div className="flex items-center justify-between rounded-lg px-0 py-1.5">
                        <span className="text-muted-foreground">建站天数</span>
                        <span className="font-medium">{days} 天</span>
                    </div>
                )}
            </div>
        </div>
    );
}

/** (blog) 右侧边栏：作者卡 + 微信卡 + 自定义块 + 公告 + 目录 + 最近文章 + 标签云 + 归档 + 最近评论 + 站点信息
 *  （300px，桌面端显示；每张卡都由站点配置开关控制）。
 *  站点公告（SITE_ANNOUNCEMENT）不在侧边栏：后端定义为「展示在导航栏下方」的 HTML 片段，
 *  改由 (blog)/layout.tsx 的导航下方通栏公告条渲染。
 *  「文章目录」卡片由 PostToc 始终渲染，是否显示由 PostToc 内部按 usePathname 判断——
 *  不依赖服务端 x-pathname（软导航时该值可能不更新，导致目录概率性不显示）。 */
export async function BlogSidebar({ config }: { config?: SiteConfig }) {
    const author = config?.sidebar?.author;
    const siteinfo = config?.sidebar?.siteinfo;
    // 侧边栏卡片开关（全部来自站点配置；为真才渲染 —— 关掉时连数据请求都不发）
    const recentPost = config?.sidebar?.recentPost;
    const tagsConfig = config?.sidebar?.tags;
    // 微信卡片：enable 为真才渲染（线上当前是 false）
    const wechat = config?.sidebar?.wechat;

    // 是否文章详情页：sidebar.custom.showInPost 这个开关（「在文章页面也显示」）需要它。
    // 用 proxy.ts 全站注入的 x-pathname —— 已在普通请求与 RSC 软导航请求上实测有值；
    // 即使它偶尔滞后，也只会让自定义块多显示/少显示一张卡，不会影响其它卡片。
    const pathname = (await headers()).get("x-pathname") ?? "";
    const isPostPage = /^\/posts\/[^/]+$/.test(pathname);

    // 自定义侧边栏块（CUSTOM_SIDEBAR）：非文章页全部显示；文章页要求总开关开启，
    // 且只显示该块自身 showInPost 不为 false 的（与官方 CustomSidebarBlocks 口径一致）
    const customBlocks = parseCustomSidebarBlocks(config?.CUSTOM_SIDEBAR);
    const visibleCustomBlocks = isPostPage
        ? config?.sidebar?.custom?.showInPost
            ? customBlocks.filter((block) => block.showInPost)
            : []
        : customBlocks;

    // 建站起点：归档最早的月份（近似）
    let earliestCreated: string | undefined;
    try {
        const archive = await getPublicArchivesCached();
        const list = archive.list ?? [];
        if (list.length > 0) {
            const first = list[list.length - 1]; // 接口按时间倒序，最后一条最早
            earliestCreated = `${first.year}-${String(first.month).padStart(2, "0")}-01T00:00:00Z`;
        }
    } catch {
        // 忽略
    }

    return (
        <CollapsibleAside>
            {/* self-stretch：aside 撑满正文高度 → sticky 的包含块足够长，长文章 TOC 全程固定；不限高：侧边栏内容完整展示，不内部滚动 */}
            <div className="top-20 space-y-4">
                {/* 作者卡 = 侧边栏第一张卡（也是最高的一张）：小屏整块隐藏，把首屏让给正文/文章列表，
                    其余卡片照常显示；lg 起（右侧固定栏）恢复显示。
                    为什么包一层而不是给 AuthorCard 根节点加 hidden：这张卡是纯装饰性大卡，
                    以后若别处复用，加了类就会被连带隐藏；包一层只影响侧边栏这里的这一处。 */}
                {author?.enable !== false && config && (
                    <div className="hidden lg:block">
                        <AuthorCard config={config} />
                    </div>
                )}
                {/* 微信卡片（sidebar.wechat） */}
                {wechat?.enable && (
                    <WechatCard
                        face={wechat.face}
                        backFace={wechat.backFace}
                        blurBackground={wechat.blurBackground}
                        link={wechat.link}
                    />
                )}
                {/* 自定义侧边栏（CUSTOM_SIDEBAR + sidebar.custom.showInPost） */}
                <CustomSidebarCard blocks={visibleCustomBlocks} />
                {/* 公告卡：原「文档链接」卡按用户要求换成公告卡；sidebar.doc.links 配置键仍然后端/设置页存在，但前台不再消费 */}
                <AnnouncementCard appName={config?.APP_NAME} />
                {/* 文章目录（sidebar.toc.collapseMode 折叠；post.toc.hash_update_mode 控制是否写 URL hash） */}
                <PostToc
                    collapseMode={config?.sidebar?.toc?.collapseMode === true}
                    hashUpdateMode={config?.post?.toc?.hash_update_mode}
                />
                {/* 最近文章（config.sidebar.recentPost） */}
                {recentPost?.enable && <RecentPostsCard count={recentPost.count} />}
                {/* 标签云（config.sidebar.tags） */}
                {tagsConfig?.enable && <TagsCard highlight={tagsConfig.highlight} />}
                {/* 下面三张是「信息型」卡片（归档 / 最近评论 / 网站信息）：
                    移动端侧边栏整块跟在正文后面，这三张会把页面拖得很长，内容在导航和对应页面
                    里也都能看到 → 小屏整块隐藏，lg 起（右侧固定栏）恢复显示。 */}
                <div className="hidden lg:block">
                    <ArchivesCard displayMonths={config?.sidebar?.archive?.displayMonths || 6} />
                </div>
                {/* 最近评论：位于网站信息上方 */}
                <div className="hidden lg:block">
                    <RecentCommentsCard
                        gravatar={{ url: config?.GRAVATAR_URL, defaultType: config?.DEFAULT_GRAVATAR_TYPE }}
                    />
                </div>
                {config && (
                    <div className="hidden lg:block">
                        <SiteInfoCard
                            totalPostCount={siteinfo?.totalPostCount}
                            totalWordCount={siteinfo?.totalWordCount}
                            runtimeEnable={siteinfo?.runtimeEnable}
                            createdAt={earliestCreated}
                        />
                    </div>
                )}
            </div>
        </CollapsibleAside>
    );
}
