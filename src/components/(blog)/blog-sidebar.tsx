import Link from "next/link";
import { ArrowRight, CalendarDays, FileText, MessageSquare, Tag as TagIcon } from "lucide-react";
import { PostToc } from "@/components/(blog)/post-toc";
import { AuthorGreeting } from "@/components/(blog)/author-greeting";
import { Icon } from "@/components/ui/icon";
import { collectTags } from "@/lib/articles";
import { getAllPublicArticlesApi, getLatestCommentsApi, getPublicArchivesApi, type RecentComment } from "@/lib/api";
import { resolveAssetUrl } from "@/lib/utils";
import type { SiteConfig } from "@/types/site-config";

const GRAVATAR_URL = process.env.NEXT_PUBLIC_GRAVATAR_URL || "https://cravatar.cn/";

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
                    <div className="text-xl font-bold tracking-tight">{config.APP_NAME || "博客"}</div>
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

/** 标签云 */
async function TagsCard() {
    let tags: ReturnType<typeof collectTags> = [];
    try {
        const articles = await getAllPublicArticlesApi();
        tags = collectTags(articles).slice(0, 20);
    } catch {
        // 忽略，标签获取失败时隐藏卡片
    }
    if (tags.length === 0) return null;

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
                        className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-primary hover:text-primary-foreground"
                    >
                        {tag.name}
                        <sup className="ml-0.5">{tag.count}</sup>
                    </Link>
                ))}
            </div>
        </div>
    );
}

/** 归档（按年月） */
async function ArchivesCard({ displayMonths = 6 }: { displayMonths?: number }) {
    let items: { year: number; month: number; count: number }[] = [];
    try {
        const data = await getPublicArchivesApi();
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
async function RecentCommentsCard({ limit = 5 }: { limit?: number }) {
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
                    const avatar = comment.email_md5
                        ? `${GRAVATAR_URL}avatar/${comment.email_md5}?d=identicon`
                        : null;
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
                                {/* 左侧头像 */}
                                {avatar ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={avatar}
                                        alt={comment.nickname}
                                        loading="lazy"
                                        className="size-8 shrink-0 rounded-full border object-cover"
                                    />
                                ) : (
                                    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                                        {(comment.nickname || "匿").charAt(0)}
                                    </div>
                                )}

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

/** (blog) 右侧边栏：作者卡 + 标签云 + 归档 + 站点信息（300px，桌面端显示）。
 *  「文章目录」卡片由 PostToc 始终渲染，是否显示由 PostToc 内部按 usePathname 判断——
 *  不依赖服务端 x-pathname（软导航时该值可能不更新，导致目录概率性不显示）。 */
export async function BlogSidebar({ config }: { config?: SiteConfig }) {
    const author = config?.sidebar?.author;
    const siteinfo = config?.sidebar?.siteinfo;

    // 建站起点：归档最早的月份（近似）
    let earliestCreated: string | undefined;
    try {
        const archive = await getPublicArchivesApi();
        const list = archive.list ?? [];
        if (list.length > 0) {
            const first = list[list.length - 1]; // 接口按时间倒序，最后一条最早
            earliestCreated = `${first.year}-${String(first.month).padStart(2, "0")}-01T00:00:00Z`;
        }
    } catch {
        // 忽略
    }

    return (
        <aside id="blog-sidebar" className="hidden w-75 shrink-0 self-stretch lg:block">
            {/* self-stretch：aside 撑满正文高度 → sticky 的包含块足够长，长文章 TOC 全程固定；
                不限高：侧边栏内容完整展示，不内部滚动 */}
            <div className="sticky top-20 space-y-4">
                {author?.enable !== false && config && <AuthorCard config={config} />}
                <PostToc />
                <TagsCard />
                <ArchivesCard displayMonths={config?.sidebar?.archive?.displayMonths || 6} />
                {/* 最近评论：位于网站信息上方 */}
                <RecentCommentsCard />
                {config && (
                    <SiteInfoCard
                        totalPostCount={siteinfo?.totalPostCount}
                        totalWordCount={siteinfo?.totalWordCount}
                        runtimeEnable={siteinfo?.runtimeEnable}
                        createdAt={earliestCreated}
                    />
                )}
            </div>
        </aside>
    );
}
