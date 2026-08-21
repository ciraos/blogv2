"use client";

import { ImagePlus, Send, Sparkles } from "lucide-react";

import type { RecentComment } from "@/lib/api";

interface CommentWithChildren extends RecentComment {
    children?: RecentComment[];
}

interface PostCommentsProps {
    /** 评论挂载路径，如 /posts/hKw5（对应后端 target_path） */
    targetPath: string;
    /** 评论列表（由服务端组件通过 GET /public/comments + children 获取后传入） */
    comments: CommentWithChildren[];
}

function resolveAvatar(comment: RecentComment): string | null {
    // 子评论优先用后端直接给的 avatar_url；父评论用 email_md5 拼 Gravatar
    if (comment.avatar_url) return comment.avatar_url;
    if (comment.email_md5) return `https://cravatar.cn/avatar/${comment.email_md5}?d=mp`;
    return null;
}

function formatTime(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
}

/** 单条评论内容行（父评论/子评论共用；reverse 时头像在右、内容在左；背景由外层组容器提供） */
function CommentRow({ comment, reverse = false }: { comment: RecentComment; reverse?: boolean }) {
    const avatarUrl = resolveAvatar(comment);

    return (
        <div className={`flex gap-3 ${reverse ? "flex-row-reverse" : ""}`}>
            {avatarUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={avatarUrl}
                    alt={comment.nickname}
                    loading="lazy"
                    className="size-9 shrink-0 rounded-full object-cover"
                />
            )}
            <div className={`min-w-0 flex-1 ${reverse ? "flex flex-col items-end" : ""}`}>
                <div
                    className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground ${
                        reverse ? "flex-row-reverse" : ""
                    }`}
                >
                    <span className="font-medium text-foreground">{comment.nickname}</span>
                    {comment.is_admin_comment && (
                        <span className="rounded bg-purple-600 px-1.5 py-0.5 text-[10px] text-slate-200">博主</span>
                    )}
                    {comment.reply_to_nick && (
                        <span className="text-muted-foreground/70">
                            回复 <span className="text-foreground/70">{comment.reply_to_nick}</span>
                        </span>
                    )}
                    <span>{formatTime(comment.created_at)}</span>
                    {comment.ip_location && comment.ip_location !== "未知" && (
                        <span>· {comment.ip_location}</span>
                    )}
                </div>
                {/* 内容气泡：relative 供尾巴定位；双三角描边尾巴指向头像一侧 */}
                <div className="relative mt-1.5 w-max py-2 px-3 border rounded-md bg-card text-sm leading-relaxed [&_p]:my-1">
                    {/* 外层三角：边框色描边，与气泡边框连续 */}
                    <span
                        aria-hidden
                        className={`absolute top-[9px] h-0 w-0 border-y-[9px] border-y-transparent ${
                            reverse
                                ? "-right-[10px] border-l-[10px] border-l-border"
                                : "-left-[10px] border-r-[10px] border-r-border"
                        }`}
                    />
                    {/* 内层三角：卡片色填充，形成箭头 */}
                    <span
                        aria-hidden
                        className={`absolute top-[10px] h-0 w-0 border-y-[8px] border-y-transparent ${
                            reverse
                                ? "-right-[8px] border-l-[8px] border-l-card"
                                : "-left-[8px] border-r-[8px] border-r-card"
                        }`}
                    />
                    <div dangerouslySetInnerHTML={{ __html: comment.content_html || "" }} />
                </div>
            </div>
        </div>
    );
}

/**
 * 文章评论区（对齐线上 CommentSection 结构：输入区 + 列表区）。
 * 评论列表（含子评论/博主回复）由服务端组件获取后传入；
 * 提交评论 POST /public/comments 接口待接入。
 */
export function PostComments({ targetPath, comments }: PostCommentsProps) {
    // TODO: 提交评论 —— submitComment(targetPath, form)
    // TODO: 随机匿名昵称、图片上传、预览（后端 allow_image_upload / emoji 配置）

    return (
        <section
            id="post-comment"
            data-target-path={targetPath}
            className="mt-10 border-t pt-6"
        >
            {/* ===== 输入区 ===== */}
            <div>
                {/* 头部：标题 + 工具（匿名 / 隐私政策） */}
                <div className="flex items-center justify-between gap-3">
                    <h2 className="flex items-center gap-1.5 text-lg font-semibold">
                        <Sparkles className="size-4.5 text-primary" />
                        评论
                    </h2>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <button
                            type="button"
                            className="rounded-md px-2 py-1 transition-colors hover:bg-muted hover:text-foreground"
                            title="随机匿名昵称"
                        >
                            匿名评论
                        </button>
                        <a href="/privacy" className="rounded-md px-2 py-1 transition-colors hover:bg-muted hover:text-foreground">
                            隐私政策
                        </a>
                    </div>
                </div>

                {/* 输入框 + 字数 */}
                <div className="mt-3 rounded-lg border bg-card">
                    <textarea
                        rows={5}
                        maxLength={500}
                        placeholder="欢迎留下宝贵的建议啦～"
                        aria-label="评论内容"
                        className="w-full resize-none rounded-t-lg bg-transparent p-3.5 text-sm outline-none placeholder:text-muted-foreground/60"
                    />
                    <div className="flex items-center justify-between border-t px-3 py-2">
                        <div className="flex items-center gap-1">
                            <button
                                type="button"
                                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                title="上传图片"
                            >
                                <ImagePlus className="size-4" />
                            </button>
                        </div>
                        <span className="text-xs tabular-nums text-muted-foreground">
                            0<span className="mx-0.5 text-muted-foreground/60">/</span>500
                        </span>
                    </div>
                </div>

                {/* 表单信息行：昵称 / 邮箱 / 网址 + 发送 */}
                <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
                    <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
                        <label className="block">
                            <span className="mb-1 block text-xs text-muted-foreground">昵称</span>
                            <input
                                type="text"
                                autoComplete="nickname"
                                placeholder="必填"
                                className="h-9 w-full rounded-lg border bg-card px-3 text-sm outline-none transition-colors focus:border-primary"
                            />
                        </label>
                        <label className="block">
                            <span className="mb-1 block text-xs text-muted-foreground">邮箱</span>
                            <input
                                type="email"
                                autoComplete="email"
                                placeholder="必填"
                                className="h-9 w-full rounded-lg border bg-card px-3 text-sm outline-none transition-colors focus:border-primary"
                            />
                        </label>
                        <label className="block">
                            <span className="mb-1 block text-xs text-muted-foreground">网址</span>
                            <input
                                type="url"
                                autoComplete="url"
                                placeholder="选填"
                                className="h-9 w-full rounded-lg border bg-card px-3 text-sm outline-none transition-colors focus:border-primary"
                            />
                        </label>
                    </div>
                    <button
                        type="button"
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
                    >
                        <Send className="size-3.5" />
                        发送
                    </button>
                </div>
            </div>

            {/* ===== 列表区 ===== */}
            <div className="mt-6">
                {comments.length > 0 ? (
                    <div className="space-y-3">
                        {comments.map((comment) => (
                            /* 每组评论（父评论 + 其博主回复）共用一个背景色（淡色，尽量不抢眼） */
                            <div key={comment.id} className="rounded-lg border border-border/40 bg-card/40 p-3.5">
                                <CommentRow comment={comment} />
                                {/* 子评论（博主回复等）：头像在右、内容在左 */}
                                {comment.children && comment.children.length > 0 && (
                                    <div className="mt-3 space-y-3 pl-3 sm:ml-4 sm:pl-4">
                                        {comment.children.map((child) => (
                                            <CommentRow key={child.id} comment={child} reverse />
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed py-10 text-sm text-muted-foreground">
                        <Sparkles className="size-5 opacity-60" />
                        <span>暂无评论，快来抢沙发～</span>
                    </div>
                )}
            </div>
        </section>
    );
}
