import Link from "next/link";
import { MessageSquare } from "lucide-react";

import { TimelineShell } from "@/components/(blog)/timeline-shell";

import type { RecentComment } from "@/lib/api";

const GRAVATAR_URL = process.env.NEXT_PUBLIC_GRAVATAR_URL || "https://cravatar.cn/";

function formatDate(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
}

/** 首页最新评论：横向时间轴（左右滚动），仿即刻动态 */
export function CommentsTimeline({ comments }: { comments: RecentComment[] }) {
    if (comments.length === 0) return null;

    return (
        <TimelineShell title="最新评论" icon={<MessageSquare className="size-4" />}>
            <div className="no-scrollbar relative overflow-x-auto pb-2">
                {/* 时间轴线（横向）：对准粉色节点正中间 */}
                <div className="absolute inset-x-0 top-6 h-0.5 bg-pink-200/70" />

                <div className="flex gap-4">
                    {comments.map((comment) => (
                        <CommentItem key={comment.id} comment={comment} />
                    ))}
                </div>
            </div>
        </TimelineShell>
    );
}

function CommentItem({ comment }: { comment: RecentComment }) {
    const avatar = comment.email_md5
        ? `${GRAVATAR_URL}avatar/${comment.email_md5}?d=identicon`
        : null;

    return (
        <div className="flex w-56 shrink-0 flex-col">
            {/* 日期：粉色节点正上方（固定 16px 行高，保证线条对齐） */}
            <span className="block whitespace-nowrap text-[11px] leading-4 text-muted-foreground">
                {formatDate(comment.created_at)}
            </span>
            {/* 粉色节点 + border 扩张动画 */}
            <span className="comment-dot relative z-10 mt-1 block" aria-hidden="true" />

            {/* 评论卡片 */}
            <div className="mt-2 flex flex-1 flex-col rounded-lg border bg-card p-2.5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-pink-300 hover:shadow-md">
                {/* 头部：头像 + 昵称 */}
                <div className="flex items-center gap-2">
                    {avatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={avatar}
                            alt={comment.nickname}
                            loading="lazy"
                            className="size-6 shrink-0 rounded-full border border-pink-100 object-cover"
                        />
                    ) : (
                        <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-pink-400 text-[10px] font-semibold text-white">
                            {(comment.nickname || "匿").charAt(0)}
                        </div>
                    )}
                    <span className="truncate text-xs font-medium">
                        {comment.nickname || "匿名"}
                        {comment.is_admin_comment && (
                            <span className="ml-1 rounded bg-pink-400 px-1 text-[10px] text-white">站长</span>
                        )}
                    </span>
                </div>

                {/* 评论内容 */}
                <p className="mt-1.5 line-clamp-4 flex-1 text-xs leading-relaxed text-foreground">
                    {comment.content || stripHtml(comment.content_html)}
                </p>

                {/* 评论目标页面 */}
                {comment.target_path && (
                    <Link
                        href={comment.target_path}
                        className="mt-2 line-clamp-1 text-[10px] text-muted-foreground transition-colors hover:text-pink-500"
                    >
                        评论于 {comment.target_title || comment.target_path}
                    </Link>
                )}
            </div>
        </div>
    );
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
