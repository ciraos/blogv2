import type { Metadata } from "next";
import Link from "next/link";

import { NumberedPagination } from "@/components/(blog)/numbered-pagination";

import { ApiError, getLatestCommentsApi, type RecentComment } from "@/lib/api";
import { generateBlogMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("最近评论");
}

const PAGE_SIZE = 20;
const GRAVATAR_URL = process.env.NEXT_PUBLIC_GRAVATAR_URL || "https://cravatar.cn/";

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

function CommentRow({ comment }: { comment: RecentComment }) {
    const avatar = comment.email_md5
        ? `${GRAVATAR_URL}avatar/${comment.email_md5}?d=identicon`
        : null;

    return (
        <div className="rounded-lg border bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
            {/* 头部：头像 + 昵称 + 时间 */}
            <div className="flex items-center gap-2.5">
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
                <p className="py-16 text-center text-sm text-muted-foreground">
                    {errorMessage ? `暂时无法获取内容：${errorMessage}` : "暂无评论，来抢沙发吧"}
                </p>
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
                    <CommentRow key={comment.id} comment={comment} />
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
