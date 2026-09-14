"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";

import { Globe, ImagePlus, MapPin, MessageCircle, Monitor, Send, Sparkles, ThumbsUp, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";

import type { RecentComment } from "@/lib/api";
import { ApiError, submitCommentApi, uploadCommentImageApi } from "@/lib/api";

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

/** 从 user_agent 解析操作系统 + 浏览器及版本（后端只有原始 UA，主题端解析展示） */
function parseUserAgent(ua?: string): { os?: string; browser: string } {
    if (!ua) return { browser: "其他" };
    let os: string | undefined;
    if (/Windows/.test(ua)) os = "Windows";
    else if (/Macintosh|Mac OS/.test(ua)) os = "macOS";
    else if (/Android/.test(ua)) os = "Android";
    else if (/iPhone|iPad|iPod/.test(ua)) os = "iOS";
    else if (/Linux/.test(ua)) os = "Linux";

    let browser = "其他";
    const edge = /Edg\/([\d.]+)/.exec(ua);
    const wv = /Chrome\/([\d.]+)/.exec(ua);
    const firefox = /Firefox\/([\d.]+)/.exec(ua);
    const safari = /Version\/([\d.]+).*Safari/.exec(ua);
    if (edge) browser = `Edge ${edge[1]}`;
    else if (/Edg/.test(ua)) browser = "Edge";
    else if (firefox) browser = `Firefox ${firefox[1]}`;
    else if (wv) browser = `Chrome ${wv[1]}`;
    else if (safari) browser = `Safari ${safari[1]}`;
    return { os, browser };
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
                    className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground ${reverse ? "flex-row-reverse" : ""
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
                    {/* 昵称最右侧：点赞 / 回复评论（后端接口待接入，暂为占位提示） */}
                    <span className="ml-auto flex items-center gap-0.5">
                        <button
                            type="button"
                            onClick={() => toast.info("点赞功能待接入")}
                            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-primary"
                            title="点赞"
                            aria-label="点赞"
                        >
                            <ThumbsUp className="size-3.5" />
                        </button>
                        <button
                            type="button"
                            onClick={() => toast.info("回复评论功能待接入")}
                            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-primary"
                            title="回复评论"
                            aria-label="回复评论"
                        >
                            <MessageCircle className="size-3.5" />
                        </button>
                    </span>
                </div>
                {/* 内容气泡：relative 供尾巴定位；双三角描边尾巴指向头像一侧 */}
                <div className="relative mt-1.5 w-max py-2 px-3 border rounded-md bg-card text-sm leading-relaxed [&_p]:my-1">
                    {/* 外层三角：边框色描边，与气泡边框连续 */}
                    <span
                        aria-hidden
                        className={`absolute top-[9px] h-0 w-0 border-y-[9px] border-y-transparent ${reverse
                                ? "-right-[10px] border-l-[10px] border-l-border"
                                : "-left-[10px] border-r-[10px] border-r-border"
                            }`}
                    />
                    {/* 内层三角：卡片色填充，形成箭头 */}
                    <span
                        aria-hidden
                        className={`absolute top-[10px] h-0 w-0 border-y-[8px] border-y-transparent ${reverse
                                ? "-right-[8px] border-l-[8px] border-l-card"
                                : "-left-[8px] border-r-[8px] border-r-card"
                            }`}
                    />
                    <div dangerouslySetInnerHTML={{ __html: comment.content_html || "" }} />
                </div>
                {/* 评论最下方：位置（未知也显示）/ 系统 / 浏览器版本，均带图标 */}
                {(comment.ip_location || comment.user_agent) && (() => {
                    const { os, browser } = parseUserAgent(comment.user_agent);
                    const items = [
                        { icon: MapPin, text: comment.ip_location || "位置" },
                        os ? { icon: Monitor, text: os } : null,
                        browser !== "其他" ? { icon: Globe, text: browser } : null,
                    ].filter((item): item is { icon: LucideIcon; text: string } => Boolean(item));
                    if (items.length === 0) return null;
                    return (
                        <div
                            className={`mt-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground ${reverse ? "justify-end" : ""
                                }`}
                        >
                            {items.map((item, i) => (
                                <span key={i} className="inline-flex items-center gap-1">
                                    <item.icon className="size-3" />
                                    {item.text}
                                </span>
                            ))}
                        </div>
                    );
                })()}
            </div>
        </div>
    );
}

/**
 * 文章评论区（对齐线上 CommentSection 结构：输入区 + 列表区）。
 * 评论列表（含子评论/博主回复）由服务端组件获取后传入；
 * 提交评论 POST /public/comments 接口待接入。
 */
/** 随机匿名昵称：4 个随机汉字 + 2 位随机数字 */
function randomAnonymousNickname(): string {
    const pool = "山水花木时光风月雨云星辰烟火流年青竹林海墨客行舟".split("");
    let name = "";
    for (let i = 0; i < 4; i++) name += pool[Math.floor(Math.random() * pool.length)];
    name += String(Math.floor(Math.random() * 100)).padStart(2, "0");
    return name;
}

export function PostComments({ targetPath, comments = [] }: PostCommentsProps) {
    // 昵称 / 邮箱（受控，匿名时锁定不可编辑）
    const [nickname, setNickname] = useState("");
    const [email, setEmail] = useState("");
    const [website, setWebsite] = useState("");
    const [content, setContent] = useState("");
    const [submitting, setSubmitting] = useState(false);
    // 评论列表：本地副本（可被提交成功后刷新），由服务端传入的 comments 初始化
    const [commentList, setCommentList] = useState<CommentWithChildren[]>(comments);
    const [anonDialogOpen, setAnonDialogOpen] = useState(false);
    const [anonDialogMode, setAnonDialogMode] = useState<"enter" | "exit">("enter");
    const [anonActive, setAnonActive] = useState(false);
    // 评论图片上传
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    /** 评论配置里是否允许传图；null 表示尚未加载到配置（仍显示按钮） */
    const [allowImageUpload, setAllowImageUpload] = useState<boolean | null>(null);
    const [commentPlaceholder, setCommentPlaceholder] = useState("欢迎留下宝贵的建议啦～");

    // 挂载时拉一次评论配置：决定是否显示传图按钮、用后端占位文案
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch("/api/public/site-config", { cache: "no-store" });
                const json = (await res.json()) as {
                    data?: { comment?: { allow_image_upload?: boolean; placeholder?: string } };
                };
                const commentCfg = json?.data?.comment;
                if (cancelled || !commentCfg) return;
                if (typeof commentCfg.allow_image_upload === "boolean") {
                    setAllowImageUpload(commentCfg.allow_image_upload);
                }
                if (commentCfg.placeholder) {
                    setCommentPlaceholder(commentCfg.placeholder);
                }
            } catch {
                // 取不到配置保持默认
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    /** 退出匿名：解除锁定，昵称 / 邮箱恢复可编辑 */
    function confirmExitAnon() {
        setAnonActive(false);
        setAnonDialogOpen(false);
    }

    /** 提交成功后重新拉取评论列表（经同源代理，后端不开放 CORS） */
    async function refetchComments() {
        try {
            const res = await fetch(
                `/api/public/comments?target_path=${encodeURIComponent(targetPath)}`,
                { cache: "no-store" }
            );
            const json = (await res.json()) as { data?: CommentWithChildren[] };
            if (res.ok && json?.data) setCommentList(json.data);
        } catch {
            // 静默失败：下次进入或刷新时自然恢复
        }
    }

    /** 提交评论：POST 转发到远端 /public/comments */
    async function handleSubmit() {
        if (!nickname.trim()) {
            toast.error("请填写昵称");
            return;
        }
        if (!content.trim()) {
            toast.error("请填写评论内容");
            return;
        }
        if (submitting) return;
        setSubmitting(true);
        try {
            await submitCommentApi({
                target_path: targetPath,
                nickname: nickname.trim(),
                email: email.trim() || undefined,
                website: website.trim() || undefined,
                content: content.trim(),
                is_anonymous: anonActive,
            });
            toast.success("评论发表成功");
            setContent("");
            setWebsite("");
            // 重新拉取评论列表，让新评论出现在评论区
            await refetchComments();
        } catch (err) {
            const msg = err instanceof ApiError ? err.message : "评论发表失败，请稍后重试";
            toast.error(msg);
        } finally {
            setSubmitting(false);
        }
    }

    /** 确认匿名：随机昵称 + 匿名邮箱（comment.anonymous_email，为空回退 blogger_email） */
    async function confirmAnonymous() {
        let anonEmail = "";
        try {
            const res = await fetch("/api/public/site-config", { cache: "no-store" });
            const json = (await res.json()) as {
                data?: { comment?: { anonymous_email?: string; blogger_email?: string } };
            };
            const commentCfg = json?.data?.comment;
            anonEmail = commentCfg?.anonymous_email || commentCfg?.blogger_email || "";
        } catch {
            // 拿不到配置则邮箱留空
        }
        setNickname(randomAnonymousNickname());
        setEmail(anonEmail);
        setAnonActive(true);
        setAnonDialogOpen(false);
    }
    /** 上传评论图片：成功后把 `![](anzhiyu://file/{id})` 追加进正文，由后端在返回列表时解析成真实 URL */
    async function handleImageUpload(event: ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        if (uploading) return;
        if (!file.type.startsWith("image/")) {
            toast.error("请选择图片文件");
            return;
        }
        setUploading(true);
        try {
            const id = await uploadCommentImageApi(file);
            setContent((prev) => `${prev ? `${prev}\n` : ""}![](anzhiyu://file/${id})`);
            toast.success("图片已插入评论");
        } catch (err) {
            const message = err instanceof ApiError ? err.message : "图片上传失败，请稍后重试";
            // 上传需要登录：若后端返回未登录/鉴权相关提示，给出明确指引
            const needsLogin =
                err instanceof ApiError &&
                (err.status === 401 || /登录|未登录|鉴权|授权/.test(message));
            toast.error(needsLogin ? "上传图片需要登录，请先登录后再试" : message);
        } finally {
            setUploading(false);
        }
    }

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
                        {anonActive ? (
                            <button
                                type="button"
                                onClick={() => {
                                    setAnonDialogMode("exit");
                                    setAnonDialogOpen(true);
                                }}
                                className="rounded-md bg-primary/10 px-2 py-1 text-primary underline underline-offset-4 transition-colors hover:bg-primary/15"
                                title="退出匿名评论"
                            >
                                匿名评论中
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={() => {
                                    setAnonDialogMode("enter");
                                    setAnonDialogOpen(true);
                                }}
                                className="rounded-md px-2 py-1 transition-colors hover:bg-muted hover:text-foreground"
                                title="随机匿名昵称"
                            >
                                匿名评论
                            </button>
                        )}
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
                        placeholder={commentPlaceholder}
                        aria-label="评论内容"
                        value={content}
                        onChange={(event) => setContent(event.target.value)}
                        className="w-full resize-none rounded-t-lg bg-transparent p-3.5 text-sm outline-none placeholder:text-muted-foreground/60"
                    />
                    <div className="flex items-center justify-between border-t px-3 py-2">
                        <div className="flex items-center gap-1">
                            {/* 评论传图：后端策略允许时才显示（后端不开放 CORS，经 /api/public/comments/upload 代理） */}
                            {allowImageUpload !== false && (
                                <>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={handleImageUpload}
                                    />
                                    <button
                                        type="button"
                                        disabled={uploading}
                                        onClick={() => fileInputRef.current?.click()}
                                        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                                        title={uploading ? "上传中…" : "上传图片"}
                                    >
                                        <ImagePlus className={uploading ? "size-4 animate-pulse" : "size-4"} />
                                    </button>
                                </>
                            )}
                        </div>
                        <span className="text-xs tabular-nums text-muted-foreground">
                            {content.length}
                            <span className="mx-0.5 text-muted-foreground/60">/</span>500
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
                                value={nickname}
                                readOnly={anonActive}
                                onChange={(event) => setNickname(event.target.value)}
                                className="h-9 w-full rounded-lg border bg-card px-3 text-sm outline-none transition-colors focus:border-primary read-only:cursor-not-allowed read-only:opacity-70"
                            />
                        </label>
                        <label className="block">
                            <span className="mb-1 block text-xs text-muted-foreground">邮箱</span>
                            <input
                                type="email"
                                autoComplete="email"
                                placeholder="必填"
                                value={email}
                                readOnly={anonActive}
                                onChange={(event) => setEmail(event.target.value)}
                                className="h-9 w-full rounded-lg border bg-card px-3 text-sm outline-none transition-colors focus:border-primary read-only:cursor-not-allowed read-only:opacity-70"
                            />
                        </label>
                        <label className="block">
                            <span className="mb-1 block text-xs text-muted-foreground">网址</span>
                            <input
                                type="url"
                                autoComplete="url"
                                placeholder="选填"
                                value={website}
                                onChange={(event) => setWebsite(event.target.value)}
                                className="h-9 w-full rounded-lg border bg-card px-3 text-sm outline-none transition-colors focus:border-primary"
                            />
                        </label>
                    </div>
                    <button
                        type="button"
                        disabled={submitting}
                        onClick={handleSubmit}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        <Send className="size-3.5" />
                        {submitting ? "发送中…" : "发送"}
                    </button>
                </div>
            </div>

            {/* ===== 列表区 ===== */}
            <div className="mt-6">
                {commentList.length > 0 ? (
                    <div className="space-y-3">
                        {commentList.map((comment) => (
                            /* 每组评论（父评论 + 其博主回复）共用一个背景色（淡色，尽量不抢眼） */
                            <div key={comment.id} className="rounded-lg border border-border/40 bg-card/80 p-3.5">
                                <CommentRow comment={comment} />
                                {/* 子评论（博主回复等）：头像在右、内容在左 */}
                                {comment.children && comment.children.length > 0 && (<div className="mt-3 space-y-3 pl-3 sm:ml-4 sm:pl-4">
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

            {/* 匿名评论确认框 */}
            {anonDialogOpen && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
                    onClick={() => setAnonDialogOpen(false)}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        className="w-full max-w-sm rounded-xl border bg-card p-5 shadow-lg"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="flex items-center justify-between">
                            <h3 className="text-base font-semibold">
                                {anonDialogMode === "enter" ? "开启匿名评论" : "退出匿名评论"}
                            </h3>
                            <button
                                type="button"
                                aria-label="关闭"
                                onClick={() => setAnonDialogOpen(false)}
                                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            >
                                <X className="size-4.5" />
                            </button>
                        </div>
                        <p className="mt-3 text-sm text-muted-foreground">
                            {anonDialogMode === "enter"
                                ? "开启后将使用随机昵称与匿名邮箱进行评论，是否继续？"
                                : "是否确认退出匿名评论？"}
                        </p>
                        <div className="mt-5 flex items-center justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setAnonDialogOpen(false)}
                                className="rounded-lg border px-4 py-1.5 text-sm transition-colors hover:bg-muted"
                            >
                                取消
                            </button>
                            <button
                                type="button"
                                onClick={() => (anonDialogMode === "enter" ? confirmAnonymous() : confirmExitAnon())}
                                className="rounded-lg bg-primary px-5 py-1.5 text-sm font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
                            >
                                {anonDialogMode === "enter" ? "确认开启" : "确认退出"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}
