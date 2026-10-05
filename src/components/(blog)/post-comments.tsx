"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";

import { Globe, ImagePlus, MapPin, MessageCircle, Monitor, Send, Sparkles, ThumbsUp, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";

import { CommentContent } from "@/components/(blog)/comment-content";
import { useGravatarConfig } from "@/components/(blog)/gravatar-provider";
import type { RecentComment } from "@/lib/api";
import { ApiError, submitCommentApi, uploadCommentImageApi } from "@/lib/api";
import { resolveCommentAvatar } from "@/lib/avatar";
import type { CommentAuthor } from "@/lib/comment-author";

interface CommentWithChildren extends RecentComment {
    children?: RecentComment[];
}

interface PostCommentsProps {
    /** 评论挂载路径，如 /posts/hKw5（对应后端 target_path） */
    targetPath: string;
    /** 评论列表（由服务端组件通过 GET /public/comments + children 获取后传入） */
    comments: CommentWithChildren[];
    /**
     * 已登录用户（服务端读取 httpOnly token 后取回）：有值时评论区不再显示昵称 / 邮箱 / 网址输入框，
     * 提交直接用账号里的这三项（后端 nickname 必填，且会据此把评论关联到账号）。
     * 为空 = 游客态，照旧显示三项并支持本地记忆回填。
     */
    author?: CommentAuthor | null;
}

function formatTime(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    // 固定时区：服务端（容器时区）与浏览器（用户本机时区）渲染结果一致，避免水合不匹配
    return d.toLocaleString("zh-CN", {
        timeZone: "Asia/Shanghai",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
}

/** 从 user_agent 解析操作系统 + 浏览器及版本（后端只有原始 UA，解析不出来时统一显示「未知」） */
function parseUserAgent(ua?: string): { os: string; browser: string } {
    if (!ua) return { os: "未知", browser: "未知" };
    let os = "未知";
    if (/Windows/.test(ua)) os = "Windows";
    else if (/Macintosh|Mac OS/.test(ua)) os = "macOS";
    else if (/Android/.test(ua)) os = "Android";
    else if (/iPhone|iPad|iPod/.test(ua)) os = "iOS";
    else if (/Linux/.test(ua)) os = "Linux";

    let browser = "未知";
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

/** 代码块配置（site-config post.code_block，与文章正文共用） */
type CodeBlockConfig = { codeMaxLines?: number; macStyle?: boolean };

/** 单条评论内容行（父评论/子评论共用；reverse 时头像在右、内容在左；背景由外层组容器提供） */
function CommentRow({
    comment,
    reverse = false,
    codeBlock,
    onReply,
}: {
    comment: RecentComment;
    reverse?: boolean;
    codeBlock?: CodeBlockConfig;
    /**
     * 点击「回复」。两级结构（和线上的「父评论 + 回复」一致）：
     * parent_id 由父组件给出（始终是该组的顶层评论），reply_to_id 是这条评论本身。
     */
    onReply?: (comment: RecentComment) => void;
}) {
    // 头像：avatar_url 优先，否则按站点配置的 GRAVATAR_URL + DEFAULT_GRAVATAR_TYPE 拼
    // （邮箱没有自定义头像时由 d= 生成兜底头像，所以这里永远有地址）
    const gravatar = useGravatarConfig();
    const avatarUrl = resolveCommentAvatar(comment, gravatar);

    return (
        <div className={`flex gap-3 ${reverse ? "flex-row-reverse" : ""}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={avatarUrl}
                alt={comment.nickname}
                loading="lazy"
                className="size-9 shrink-0 rounded-full object-cover"
            />
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
                    {/* 昵称最右侧：点赞（接口待接入，暂为占位提示）/ 回复评论 */}
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
                            onClick={() => onReply?.(comment)}
                            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-primary"
                            title="回复评论"
                            aria-label={`回复 ${comment.nickname}`}
                        >
                            <MessageCircle className="size-3.5" />
                        </button>
                    </span>
                </div>
                {/* 内容气泡：铺满评论列、无边框（层次由外层的评论卡片提供）；
                    回复别人的评论（reverse，头像在右）正文靠右显示，代码框内部由 CSS 复位为左对齐；
                    引用块（即刻页「评论这条说说」以 `> 引用` 提交）默认只显示 2 行、超出省略号。
                    line-clamp 必须落在「没有 padding 的内层 <p>」上，不能落在 blockquote 上：
                    带 padding 的元素被 line-clamp 时，Chromium 只把内容高度截到 2 行，而
                    overflow:hidden 的裁剪边界仍是 padding box —— 底部 7px 内边距会把第 3 行的
                    上半截字形露出来，引用看起来就是「被拦腰切断 / 内容没了一半」。 */}
                <div
                    className={`comment-bubble relative mt-1.5 w-full min-w-0 break-words py-2 px-3 rounded-md bg-card text-sm leading-relaxed [&_p]:my-1 [&_blockquote>p]:line-clamp-2 ${reverse ? "comment-bubble-reverse" : ""
                        }`}
                >
                    {/* 气泡尾巴：卡片色三角，指向头像一侧（去掉边框后不再需要外层描边三角） */}
                    <span
                        aria-hidden
                        className={`absolute top-[10px] h-0 w-0 border-y-[8px] border-y-transparent ${reverse
                                ? "-right-[8px] border-l-[8px] border-l-card"
                                : "-left-[8px] border-r-[8px] border-r-card"
                            }`}
                    />
                    {/* 评论正文：由 CommentContent 渲染，代码块增强成与文章一致的代码框 */}
                    <CommentContent html={comment.content_html || ""} codeBlock={codeBlock} />
                </div>
                {/* 评论最下方：位置 / 系统 / 浏览器版本，均带图标；解析不出来也照样显示「未知」 */}
                {(comment.ip_location || comment.user_agent) && (() => {
                    const { os, browser } = parseUserAgent(comment.user_agent);
                    const items: { icon: LucideIcon; text: string }[] = [
                        { icon: MapPin, text: comment.ip_location || "未知" },
                        { icon: Monitor, text: os },
                        { icon: Globe, text: browser },
                    ];
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
 * 发表 / 回复统一走 POST /public/comments（回复时带 parent_id + reply_to_id）。
 */
/** 随机匿名昵称：4 个随机汉字 + 2 位随机数字 */
function randomAnonymousNickname(): string {
    const pool = "山水花木时光风月雨云星辰烟火流年青竹林海墨客行舟".split("");
    let name = "";
    for (let i = 0; i < 4; i++) name += pool[Math.floor(Math.random() * pool.length)];
    name += String(Math.floor(Math.random() * 100)).padStart(2, "0");
    return name;
}

/** 评论者信息本地缓存：发表过一次后写入，进入任意评论区自动回填 */
const AUTHOR_STORAGE_KEY = "blog:comment-author";

function readStoredAuthor(): { nickname: string; email: string; website: string } {
    if (typeof window === "undefined") return { nickname: "", email: "", website: "" };
    try {
        const raw = window.localStorage.getItem(AUTHOR_STORAGE_KEY);
        if (!raw) return { nickname: "", email: "", website: "" };
        const obj = JSON.parse(raw) as { nickname?: unknown; email?: unknown; website?: unknown };
        return {
            nickname: typeof obj.nickname === "string" ? obj.nickname : "",
            email: typeof obj.email === "string" ? obj.email : "",
            website: typeof obj.website === "string" ? obj.website : "",
        };
    } catch {
        return { nickname: "", email: "", website: "" };
    }
}

function saveStoredAuthor(nickname: string, email: string, website: string) {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(AUTHOR_STORAGE_KEY, JSON.stringify({ nickname, email, website }));
    } catch {
        // 隐私模式 / 存储禁用时写入失败：忽略
    }
}

export function PostComments({ targetPath, comments = [], author = null }: PostCommentsProps) {
    // 已登录：昵称 / 邮箱 / 网址取自账号，三项输入框不显示，直接用它提交
    const loggedIn = Boolean(author);
    // 昵称 / 邮箱 / 网址（受控，匿名时锁定不可编辑）：登录态用账号里的值初始化
    const [nickname, setNickname] = useState(author?.nickname ?? "");
    const [email, setEmail] = useState(author?.email ?? "");
    const [website, setWebsite] = useState(author?.website ?? "");
    const [content, setContent] = useState("");
    const [submitting, setSubmitting] = useState(false);
    /**
     * 当前正在回复的目标（null = 发表顶层评论）。
     * 评论区只有一个主输入框（昵称 / 邮箱 / 匿名 / 传图状态都挂在它身上），
     * 所以「回复」不另开一个输入框：点击后把主输入框切到回复态、滚动到视野内并聚焦，
     * 发送时带上 parent_id（顶层父评论）+ reply_to_id（被回复的那条）。
     */
    const [replyTarget, setReplyTarget] = useState<{
        parentId: string;
        replyToId: string;
        nickname: string;
    } | null>(null);
    /** 主输入框：点「回复」后滚动 + 聚焦到这里 */
    const contentRef = useRef<HTMLTextAreaElement>(null);
    /**
     * 引用文本（如即刻页点某条说说的「评论」按钮后带过来的内容摘要）。
     * 由外部通过 window 事件 `comment-form-set-quote` 注入（带 targetPath，只响应本评论区）；
     * 提交时会拼成 Markdown 引用块 `> 引用`，让所有人一眼看出评论的是哪条内容。
     */
    const [quoteText, setQuoteText] = useState("");
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
    /** 代码块配置（site-config post.code_block）：让评论里的代码框与文章正文一致 */
    const [codeBlock, setCodeBlock] = useState<CodeBlockConfig | undefined>(undefined);

    // 挂载时拉一次评论配置：决定是否显示传图按钮、用后端占位文案
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch("/api/public/site-config", { cache: "no-store" });
                const json = (await res.json()) as {
                    data?: {
                        comment?: { allow_image_upload?: boolean; placeholder?: string };
                        post?: { code_block?: { code_max_lines?: number; mac_style?: boolean } };
                    };
                };
                if (cancelled) return;
                // 代码块配置：评论区代码框与文章正文共用同一套（mac 圆点 / 折叠行数）
                const cb = json?.data?.post?.code_block;
                if (cb) setCodeBlock({ codeMaxLines: cb.code_max_lines, macStyle: cb.mac_style });
                const commentCfg = json?.data?.comment;
                if (!commentCfg) return;
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

    // 进入评论区时回填上次发表评论用的昵称 / 邮箱 / 网址（仅客户端执行，避免水合不匹配）
    // 登录态已用账号信息初始化，不需要也不应该再被本地记忆覆盖
    useEffect(() => {
        if (loggedIn) return;
        const stored = readStoredAuthor();
        if (!stored.nickname && !stored.email && !stored.website) return;
        // 放到下一个 tick 再回填：effect 内同步 setState 会造成级联渲染（react-hooks/set-state-in-effect）
        const timer = setTimeout(() => {
            setNickname((prev) => prev || stored.nickname);
            setEmail((prev) => prev || stored.email);
            setWebsite((prev) => prev || stored.website);
        }, 0);
        return () => clearTimeout(timer);
    }, [loggedIn]);

    /**
     * 外部（如即刻页的说卡片）请求把某段内容作为「引用」填入本评论区。
     * 事件 detail 带 targetPath，只响应属于本页的请求，避免同页多个评论区互相串台
     * （与线上 CommentSection 的 comment-form-set-quote 约定一致）。
     */
    useEffect(() => {
        function handleSetQuote(event: Event) {
            const detail = (event as CustomEvent<{ text?: string; targetPath?: string }>).detail;
            const incoming = detail?.text?.trim();
            if (!incoming) return;
            if (detail?.targetPath && detail.targetPath !== targetPath) return;
            setQuoteText(incoming);
            requestAnimationFrame(() => contentRef.current?.focus());
        }
        window.addEventListener("comment-form-set-quote", handleSetQuote as EventListener);
        return () => window.removeEventListener("comment-form-set-quote", handleSetQuote as EventListener);
    }, [targetPath]);

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

    /**
     * 点击某条评论的「回复」：记录回复目标，并把主输入框切到回复态。
     * @param comment 被回复的那条评论
     * @param parentId 该组的顶层父评论 id（回复子评论时仍是顶层父评论，保持两级结构）
     */
    function handleReply(comment: RecentComment, parentId: string) {
        setReplyTarget({ parentId, replyToId: comment.id, nickname: comment.nickname });
        // 等提示条渲染出来（输入框会下移）再滚动，避免定位偏移
        requestAnimationFrame(() => {
            contentRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
            contentRef.current?.focus();
        });
    }

    /** 提交评论：POST 转发到远端 /public/comments；回复态时带上 parent_id / reply_to_id */
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
        // 引用块放在正文最前面（Markdown 引用），发出去后所有人可见，能看出评论的是哪条内容
        const finalContent = quoteText ? `> ${quoteText}\n\n${content.trim()}` : content.trim();
        try {
            await submitCommentApi({
                target_path: targetPath,
                nickname: nickname.trim(),
                email: email.trim() || undefined,
                website: website.trim() || undefined,
                content: finalContent,
                is_anonymous: anonActive,
                // 回复态：parent_id 挂到顶层父评论，reply_to_id 指向被回复的那条
                parent_id: replyTarget?.parentId,
                reply_to_id: replyTarget?.replyToId,
            });
            toast.success(replyTarget ? `回复 @${replyTarget.nickname} 成功` : "评论发表成功");
            // 记住昵称 / 邮箱 / 网址：下次在任意评论区自动回填（匿名评论为随机身份，不覆盖已存信息）
            // 登录态的三项来自账号，不写入本地记忆（避免账号邮箱留痕到未登录的表单里）
            if (!anonActive && !loggedIn) saveStoredAuthor(nickname.trim(), email.trim(), website.trim());
            setContent("");
            setWebsite("");
            // 退出回复态，避免下一条评论误挂到同一个人
            setReplyTarget(null);
            // 清掉引用，避免下一条评论继续带上同一条引用
            setQuoteText("");
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

    // 输入框区域最上方的块（决定谁带圆角）：引用 > 回复提示 > 输入框本身
    const topBlock: "quote" | "reply" | "textarea" = quoteText
        ? "quote"
        : replyTarget
            ? "reply"
            : "textarea";

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
                        <Link href="/privacy" className="rounded-md px-2 py-1 transition-colors hover:bg-muted hover:text-foreground">
                            隐私政策
                        </Link>
                    </div>
                </div>

                {/* 输入框 + 字数 */}
                <div className="mt-3 rounded-lg border bg-card">
                    {/* 引用预览：由外部（即刻页的说卡片等）通过 comment-form-set-quote 事件注入，
                        提交时会拼成 Markdown 引用 `> 引用` 放在正文最前面 */}
                    {quoteText && (
                        <div
                            className={`flex items-start justify-between gap-2 border-b bg-muted/40 px-3 py-2 ${
                                topBlock === "quote" ? "rounded-t-lg" : ""
                            }`}
                        >
                            <div className="min-w-0 flex-1">
                                <div className="text-[11px] font-medium text-muted-foreground">引用</div>
                                <div className="mt-0.5 line-clamp-2 border-l-2 border-primary/40 pl-2 text-xs leading-relaxed text-foreground/80">
                                    {quoteText}
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setQuoteText("")}
                                title="取消引用"
                                aria-label="取消引用"
                                className="inline-flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            >
                                <X className="size-3.5" />
                                取消
                            </button>
                        </div>
                    )}
                    {/* 回复态提示条：点某条评论的「回复」后出现，发送时会带上 parent_id / reply_to_id */}
                    {replyTarget && (
                        <div
                            className={`flex items-center justify-between gap-2 border-b bg-primary/5 px-3 py-2 text-xs ${
                                topBlock === "reply" ? "rounded-t-lg" : ""
                            }`}
                        >
                            <span className="min-w-0 truncate text-muted-foreground">
                                正在回复 <span className="font-medium text-primary">@{replyTarget.nickname}</span>
                            </span>
                            <button
                                type="button"
                                onClick={() => setReplyTarget(null)}
                                title="取消回复"
                                aria-label="取消回复"
                                className="inline-flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            >
                                <X className="size-3.5" />
                                取消
                            </button>
                        </div>
                    )}
                    <textarea
                        ref={contentRef}
                        rows={5}
                        maxLength={500}
                        placeholder={replyTarget ? `回复 @${replyTarget.nickname}…` : commentPlaceholder}
                        aria-label="评论内容"
                        value={content}
                        onChange={(event) => setContent(event.target.value)}
                        className={`w-full resize-none bg-transparent p-3.5 text-sm outline-none placeholder:text-muted-foreground/60 ${
                            topBlock === "textarea" ? "rounded-t-lg" : ""
                        }`}
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

                {/* 表单信息行：未登录时显示昵称 / 邮箱 / 网址输入（登录态下这三项取自账号，无输入框、也不再显示提示文案）。
                    移动端：三框在左上下排列，发送按钮独占右列并把高度撑满这三行（items-stretch，
                    按钮自身不设固定高，min-h-9 只保底）；≥sm：三框一行，按钮回到右侧底部对齐 */}
                <div className={`mt-3 flex gap-3 ${loggedIn ? "flex-wrap items-end justify-end" : "items-stretch sm:items-end"}`}>
                    {loggedIn ? null : (
                        <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
                            <label className="flex items-center gap-2 sm:block">
                                <span className="block shrink-0 text-xs text-muted-foreground sm:mb-1">昵称</span>
                                <input
                                    type="text"
                                    autoComplete="nickname"
                                    placeholder="必填"
                                    value={nickname}
                                    readOnly={anonActive}
                                    onChange={(event) => setNickname(event.target.value)}
                                    className="h-9 w-full min-w-0 flex-1 rounded-lg border bg-card px-3 text-sm outline-none transition-colors focus:border-primary read-only:cursor-not-allowed read-only:opacity-70 sm:flex-none"
                                />
                            </label>
                            <label className="flex items-center gap-2 sm:block">
                                <span className="block shrink-0 text-xs text-muted-foreground sm:mb-1">邮箱</span>
                                <input
                                    type="email"
                                    autoComplete="email"
                                    placeholder="必填"
                                    value={email}
                                    readOnly={anonActive}
                                    onChange={(event) => setEmail(event.target.value)}
                                    className="h-9 w-full min-w-0 flex-1 rounded-lg border bg-card px-3 text-sm outline-none transition-colors focus:border-primary read-only:cursor-not-allowed read-only:opacity-70 sm:flex-none"
                                />
                            </label>
                            <label className="flex items-center gap-2 sm:block">
                                <span className="block shrink-0 text-xs text-muted-foreground sm:mb-1">网址</span>
                                <input
                                    type="url"
                                    autoComplete="url"
                                    placeholder="选填"
                                    value={website}
                                    onChange={(event) => setWebsite(event.target.value)}
                                    className="h-9 w-full min-w-0 flex-1 rounded-lg border bg-card px-3 text-sm outline-none transition-colors focus:border-primary sm:flex-none"
                                />
                            </label>
                        </div>
                    )}
                    {/* 移动端：发送按钮独占右列、高度撑满左侧三行；≥sm 回到右侧底部（原样） */}
                    <button
                        type="button"
                        disabled={submitting}
                        onClick={handleSubmit}
                        className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
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
                            <div
                                key={comment.id}
                                className={`rounded-lg border p-3.5 transition-colors ${
                                    replyTarget?.parentId === comment.id
                                        ? "border-primary/40 bg-primary/[0.03]"
                                        : "border-border/40 bg-card/80"
                                }`}
                            >
                                <CommentRow
                                    comment={comment}
                                    codeBlock={codeBlock}
                                    onReply={(target) => handleReply(target, comment.id)}
                                />
                                {/* 子评论（博主回复等）：头像在右、内容在左 */}
                                {comment.children && comment.children.length > 0 && (<div className="mt-3 space-y-3 pl-3 sm:ml-4 sm:pl-4">
                                    {comment.children.map((child) => (
                                        <CommentRow
                                            key={child.id}
                                            comment={child}
                                            reverse
                                            codeBlock={codeBlock}
                                            onReply={(target) => handleReply(target, comment.id)}
                                        />
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
