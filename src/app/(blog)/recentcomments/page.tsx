import type { Metadata } from "next";
import Link from "next/link";

import { CommentAvatar } from "@/components/(blog)/comment-avatar";
import { NumberedPagination } from "@/components/(blog)/numbered-pagination";

import { ApiError, getLatestCommentsApi, type RecentComment } from "@/lib/api";
import { resolveCommentAvatar, type GravatarConfig } from "@/lib/avatar";
import { generateBlogMetadata } from "@/lib/seo";
import { getSiteConfigs } from "@/lib/site-config";
import { EmptyState } from "@/components/(blog)/empty-state";
import { MessageCircle } from "lucide-react";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("最近评论");
}

const PAGE_SIZE = 20;

function formatDate(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
}

/** content 为空时从 content_html 剥离标签取纯文本 */
function stripHtml(html?: string): string {
    if (!html) return "";
    return html
        .replace(/<br\s*\/?>/gi, " ")
        .replace(/<\/p>/gi, " ")
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function CommentRow({ comment, gravatar }: { comment: RecentComment; gravatar?: GravatarConfig }) {
    // 头像口径与评论区一致：avatar_url 优先，否则按站点 GRAVATAR_URL + DEFAULT_GRAVATAR_TYPE 拼
    const avatar = resolveCommentAvatar(comment, gravatar);

    return (
        <div className="rounded-lg border bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
            {/* 头部：头像 + 昵称 + 时间 */}
            <div className="flex items-center gap-2.5">
                {/* 地址永远有值（无邮箱时由 d= 生成兜底头像）；加载失败退化首字头像 */}
                <CommentAvatar
                    src={avatar}
                    name={comment.nickname}
                    className="size-8 shrink-0 rounded-full border object-cover"
                />
                <span className="min-w-0 truncate text-sm font-medium">
                    {comment.nickname || "匿名"}
                    {comment.is_admin_comment && (
                        <span className="ml-1.5 rounded bg-primary px-1 py-px text-[10px] text-primary-foreground">站长</span>
                    )}
                </span>
                {comment.ip_location && (
                    <span className="shrink-0 text-xs text-muted-foreground">{comment.ip_location}</span>
                )}
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">{formatDate(comment.created_at)}</span>
            </div>

            {/* 评论内容 */}
            <p className="mt-2.5 text-sm leading-relaxed text-foreground">
                {comment.content || stripHtml(comment.content_html)}
            </p>

            {/* 评论目标页面 */}
            {comment.target_path && (
                <Link
                    href={comment.target_path}
                    className="mt-2.5 line-clamp-1 block text-xs text-muted-foreground transition-colors hover:text-primary"
                >
                    评论于 {comment.target_title || comment.target_path}
                </Link>
            )}
        </div>
    );
}

interface RecentCommentsSearchParams {
    page?: string;
}

export default async function RecentComments({ searchParams }: { searchParams: Promise<RecentCommentsSearchParams> }) {
    const sp = await searchParams;
    const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

    // 头像配置（站点配置里的 GRAVATAR_URL / DEFAULT_GRAVATAR_TYPE）。
    // 同一请求内 layout / PageWithSidebar 已请求过同一地址，Next 会复用，不会多打一次后端。
    const config = await getSiteConfigs();
    const gravatar: GravatarConfig = {
        url: config?.GRAVATAR_URL,
        defaultType: config?.DEFAULT_GRAVATAR_TYPE,
    };

    let data;
    let errorMessage: string | null = null;
    try {
        data = await getLatestCommentsApi({ page, pageSize: PAGE_SIZE });
    } catch (err) {
        errorMessage = err instanceof ApiError ? err.message : "网络请求失败";
        data = null;
    }

    // 空态 / 错误态
    if (!data || data.list.length === 0) {
        return (
            <div className="w-full space-y-6">
                <h1 className="text-2xl font-bold tracking-tight">最近评论</h1>
                <EmptyState
                    icon={MessageCircle}
                    title={errorMessage ? "暂时无法获取内容" : "暂无评论，来抢沙发吧"}
                    description={errorMessage ?? undefined}
                />
            </div>
        );
    }

    const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));

    return (
        <div className="w-full space-y-6">
            <header>
                <h1 className="text-2xl font-bold tracking-tight">最近评论</h1>
                <p className="mt-1 text-sm text-muted-foreground">全站最新 {data.total} 条评论</p>
            </header>

            <div className="space-y-3">
                {data.list.map((comment) => (
                    <CommentRow key={comment.id} comment={comment} gravatar={gravatar} />
                ))}
            </div>

            <NumberedPagination
                page={page}
                totalPages={totalPages}
                makePageHref={(p) => `/recentcomments?page=${p}`}
            />
        </div>
    );
}
