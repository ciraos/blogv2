"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ChangeEvent } from "react";
import Link from "next/link";

import { Eye, EyeOff, Globe, ImagePlus, MapPin, MessageCircle, Monitor, Send, Smile, Sparkles, ThumbsUp, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";

import { CommentContent } from "@/components/(blog)/comment-content";
import { CommentAvatar } from "@/components/(blog)/comment-avatar";
import { CommentMarkdownPreview, createAnzhiyuImageUrlResolver } from "@/components/(blog)/comment-preview";
import { useGravatarConfig } from "@/components/(blog)/gravatar-provider";
import type { RecentComment } from "@/lib/api";
import { ApiError, likeCommentApi, submitCommentApi, unlikeCommentApi, uploadCommentImageApi } from "@/lib/api";
import { resolveCommentAvatar } from "@/lib/avatar";
import type { CommentAuthor } from "@/lib/comment-author";
import {
    getCommentLikeServerSnapshot,
    isCommentLiked,
    setCommentLiked,
    subscribeCommentLikes,
} from "@/lib/comment-likes";

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

/** 表情包里的单个表情（text 不带冒号，插入时补成 `:text:` 交给后端替换成图片） */
interface EmojiPackItem {
    text: string;
    icon: string;
}

/** 一「包」表情 = 面板底部的一个 tab */
interface EmojiPack {
    name: string;
    icon: string;
    items: EmojiPackItem[];
}

/**
 * 解析后端约定的表情包 JSON（默认值就是官方主题那份 twikoo.json，见后端
 * internal/configdef/definition.go:226 的 comment.emoji_cdn）。结构：
 *   { '<img src="…" title="包名">': { type: "image", container: [{ icon: '<img src="…">', text: "heo-害羞" }] } }
 * 包名与图标都藏在 HTML 字符串里，所以这里用正则取 src / title，只留「有图标 + 有文字」的项。
 */
function parseEmojiPacks(json: Record<string, { container?: Array<{ icon?: string; text?: string }> }>): EmojiPack[] {
    return Object.entries(json)
        .map(([key, pack]) => ({
            name: /title="([^"]+)"/.exec(key)?.[1] ?? "表情",
            icon: /src="([^"]+)"/.exec(key)?.[1] ?? "",
            items: (pack?.container ?? []).flatMap((item) => {
                const icon = /src="([^"]+)"/.exec(item?.icon ?? "")?.[1];
                const text = (item?.text ?? "").trim();
                return icon && text ? [{ text, icon }] : [];
            }),
        }))
        .filter((pack) => pack.items.length > 0);
}

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

    /* ---------- 点赞 ----------
     * 后端 `/public/comments/{id}/like` 只是计数器 +1，不记是谁点的（见 lib/api.ts 注释），
     * 所以「本浏览器点过没有」由 localStorage 记账，用 useSyncExternalStore 读，
     * 避免在 effect 里 setState（会触发 react-compiler 的 set-state-in-effect 规则）。
     */
    const liked = useSyncExternalStore(
        subscribeCommentLikes,
        () => isCommentLiked(comment.id),
        getCommentLikeServerSnapshot
    );
    // 点赞数：先用服务端下发的 like_count，点过之后按接口返回值更新
    const [likeCount, setLikeCount] = useState(comment.like_count ?? 0);
    const [likeBusy, setLikeBusy] = useState(false);

    async function toggleLike() {
        if (likeBusy) return;
        setLikeBusy(true);
        // 乐观更新：先动 UI，失败再回滚（下面的 catch 里回滚）
        const nextLiked = !liked;
        const optimistic = Math.max(0, likeCount + (nextLiked ? 1 : -1));
        setLikeCount(optimistic);
        try {
            const latest = nextLiked ? await likeCommentApi(comment.id) : await unlikeCommentApi(comment.id);
            setCommentLiked(comment.id, nextLiked);
            setLikeCount(typeof latest === "number" && latest >= 0 ? latest : optimistic);
        } catch (err) {
            setLikeCount(likeCount); // 回滚
            toast.error(err instanceof ApiError ? err.message : "操作失败，请稍后重试");
        } finally {
            setLikeBusy(false);
        }
    }

    return (
        <div className={`flex gap-3 ${reverse ? "flex-row-reverse" : ""}`}>
            <CommentAvatar
                src={avatarUrl}
                name={comment.nickname}
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
                    {/* 昵称最右侧：点赞 / 回复评论 */}
                    <span className="ml-auto flex items-center gap-0.5">
                        <button
                            type="button"
                            onClick={toggleLike}
                            disabled={likeBusy}
                            aria-pressed={liked}
                            className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 transition-colors hover:bg-muted hover:text-primary disabled:opacity-60 ${
                                liked ? "text-primary" : "text-muted-foreground"
                            }`}
                            title={liked ? "取消点赞" : "点赞"}
                            aria-label={liked ? "取消点赞" : "点赞"}
                        >
                            <ThumbsUp className={`size-3.5 ${liked ? "fill-current" : ""}`} />
                            {likeCount > 0 && <span className="tabular-nums">{likeCount}</span>}
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
                {/* 内容气泡的正文排版约束：回复别人的评论（reverse，头像在右）正文靠右显示，
                    代码框内部由 CSS 复位为左对齐；引用块（即刻页「评论这条说说」以 `> 引用` 提交）
                    默认只显示 2 行、超出省略号。
                    line-clamp 必须落在「没有 padding 的内层 <p>」上，不能落在 blockquote 上：
                    带 padding 的元素被 line-clamp 时，Chromium 只把内容高度截到 2 行，而
                    overflow:hidden 的裁剪边界仍是 padding box —— 底部 7px 内边距会把第 3 行的
                    上半截字形露出来，引用看起来就是「被拦腰切断 / 内容没了一半」。 */}
                {/* 评论正文本体（用户要求：这一段文字加左右两条蓝色边框，框右下角挂「大肥鱼」）。
                    宽度 w-fit + max-w-full：框按内容收缩（不再撑满整列），长文本到 max-w-full
                    仍然正常换行；子回复那一列是 flex-col items-end，收缩后自然贴右不会错位。
                    边框：只留左右两条（border-x + border-y-0，用户要求"只显示左右俩边的边框"）。
                    颜色 = 从 public/mascot-dsh.png 采样出的主体蓝（头发/耳朵区域出现最多的蓝色
                    桶 #566cad / hsl(225,35%,51%)，见 scripts/png-blue-sample.mjs 的输出）；
                    深色模式同色相提亮降低饱和 = #8599d6 —— 参考图没有深色版，暗底上直接用
                    原样的 #566cad 会糊掉，所以按"同色相、提亮"的规则给一套对应值。
                    边框色必须写字面量类名（Tailwind 静态扫描，模板变量拼出来的类名不会生成 CSS）。
                    右侧 pr-6 是给挂件预留的通道，避免最后一行的文字被挂件压住。
                    底部那行「位置 · 系统 · 浏览器」仍留在框外独立一行（照官方 .commentMeta
                    的做法 —— CommentItem.module.css:218-226 就是正文之后的独立 meta 行）。 */}
                <div
                    className={`comment-bubble relative mt-1.5 w-fit max-w-full min-w-0 break-words rounded-md border-x border-y-0 border-x-[#566cad] bg-card py-2 pl-3 pr-6 text-sm leading-relaxed dark:border-x-[#8599d6] [&_p]:my-1 [&_blockquote>p]:line-clamp-2 ${reverse ? "comment-bubble-reverse" : ""
                        }`}
                >
                    {/* 气泡尾巴：指向评论者头像的小三角（用户要求把那截"空白"做成尾巴）。
                        为什么原来会看着"缺一截"：尾巴是一层卡片色（白）三角，而绝对定位的参照系是
                        容器的 padding box（不含 1px 边框），所以 -left-[8px] 实际只贴到边框外沿，
                        三角形又只画在边框外侧 -> 空白三角紧贴蓝线，读起来就是"边框断了一截"。
                        现在两层三角叠出来：外层是边框蓝，内层是卡片色并主动压进边框 1px（把它"吃"掉），
                        于是左/右边框在尾巴处自然开口、并沿三角形的两条斜边留出 1px 蓝描边，
                        形成完整的气泡形态。几何：外层 top-9px/上下各 9px、内层 top-10px/上下各 8px，
                    尾巴深 8px（探出边框外 8px）、高 18px、斜边留 1px 蓝描边。
                    圆角微调：上一轮为了"别让两条竖线上下弯成括号"用了直角（rounded-none）。
                        这一轮用户要求给小圆角，取 rounded-md —— 本项目 --radius=10px，
                        所以 rounded-md 实际是 8px（globals.css:53 的 calc），是"能看出圆、
                        又不至于像括号"的一档：框高 47px 时弧段只占 8px，
                        左边框的直线段仍有 y=8~39px，尾巴开口落在 y=10~26px，
                        整段开口都在直线段内，所以尾巴与边框的衔接不会断开（已截图实测）。
                        右边框同理，右下角弧线正好被那颗挂件压住，弧的收尾也被盖掉了。 */}
                    <span
                        aria-hidden
                        className={`absolute top-[9px] h-0 w-0 border-y-[9px] border-y-transparent ${reverse
                                ? "-right-[9px] border-l-[9px] border-l-[#566cad] dark:border-l-[#8599d6]"
                                : "-left-[9px] border-r-[9px] border-r-[#566cad] dark:border-r-[#8599d6]"
                            }`}
                    />
                    <span
                        aria-hidden
                        className={`absolute top-[10px] h-0 w-0 border-y-[8px] border-y-transparent ${reverse
                                ? "-right-[7px] border-l-[8px] border-l-card"
                                : "-left-[7px] border-r-[8px] border-r-card"
                            }`}
                    />
                    {/* 评论正文：由 CommentContent 渲染，代码块增强成与文章一致的代码框 */}
                    <CommentContent html={comment.content_html || ""} codeBlock={codeBlock} />
                    {/* 框右下角的小挂件（装饰）。
                        为什么用绝对定位 + 负偏移：它要"挂"在框角上、略微探出描边，
                        又必须完全不参与文本排版 —— 绝对定位把它从文档流里摘出去，
                        不撑高边框、也不改变正文的换行（占位留给容器的 pr-6）。
                        为什么必须 overflow-hidden + 圆形：原图是不透明底的室内场景，
                        方形贴上去就是一个色块，裁成圆再配一圈主题描边才像有意的挂件
                        （圆形 + 1px 主题描边的口径见官方 .commentAvatar，
                         CommentItem.module.css:10-16）。
                        pointer-events-none + aria-hidden + select-none：不可点击、
                        读屏忽略、不可选中，确保它只是贴纸而不是内容。
                        尺寸 22px（移动）/24px（≥sm）、负偏移 4px（略溢出边框）。 */}
                    <span
                        aria-hidden="true"
                        data-comment-mascot=""
                        className="pointer-events-none absolute -right-1 -bottom-1 size-[22px] select-none overflow-hidden rounded-[50%] ring-1 ring-border shadow-sm sm:size-6"
                    >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={COMMENT_MASCOT_SRC}
                            alt=""
                            loading="lazy"
                            className="size-full object-cover object-[50%_38%]"
                        />
                    </span>
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

/**
 * 评论正文框右下角的小挂件图。
 * 来源：用户提供的「娘化形象：大肥鱼」原图，放在 public/ 下（160×153 PNG，**不透明底**，
 * 画的是室内场景，所以渲染时必须圆形裁剪，否则会露出一个方块背景）。
 * 纯装饰 —— 与评论者身份无关，不取任何用户信息，也不参与提交逻辑。
 */
const COMMENT_MASCOT_SRC = "/mascot-dsh.png";

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
    /**
     * 「Markdown 预览」开关（纯前端状态，不影响提交链路）。
     * 打开时在输入框容器底部、工具栏下方渲染一块本地渲染的 Markdown 预览；
     * 再次点击隐藏。
     */
    const [previewOpen, setPreviewOpen] = useState(false);
    /* ---------- 评论表情包（OwO 面板） ----------
     * 配置来源：site-config 的 comment.emoji_cdn（后台「评论设置 → 表情包配置地址」）。
     * 后端并不提供表情接口：面板自己去拉这个 CDN 上的 twikoo 风格 JSON
     * （见 parseEmojiPacks 的注释），插入的形式是 ` :text: `，由后端在生成 content_html 时
     * 换成一个 `<img class="anzhiyu-owo-emotion">`。所以：
     *   - 面板只在第一次打开时才拉 JSON（几百 KB，不值得每次进页面都下载）；
     *   - 插入前后各补一个空格，避免和相邻文字粘成别的词、也让后端替换更稳。 */
    /** 表情包 JSON 地址；为空表示后台没配，按钮不显示 */
    const [emojiCdn, setEmojiCdn] = useState("");
    const [emojiOpen, setEmojiOpen] = useState(false);
    const [emojiLoading, setEmojiLoading] = useState(false);
    /** null = 还没拉过；[] = 拉过但为空 / 失败（不再重试，避免反复打 CDN） */
    const [emojiPacks, setEmojiPacks] = useState<EmojiPack[] | null>(null);
    const [emojiPackIndex, setEmojiPackIndex] = useState(0);
    const emojiWrapRef = useRef<HTMLDivElement>(null);
    /**
     * 刚上传成功的图片：`anzhiyu://file/{id}` → 本地 blob URL。
     * 后端是在**返回评论列表时**才把内部协议换成一次性签名 URL 的
     * （scripts/anheyu/anheyu-app-main/pkg/service/comment/service.go:1078-1135，有效期 1 小时），
     * 前端拿不到也没法本地复现，所以照官方主题的做法（theme-anheyu-next-main
     * src/components/post/Comment/CommentForm.tsx:380-383）自己留一份 blob URL 供预览显示真图。
     *
     * 为什么是 state 而不是 ref：这份映射是**渲染期要读的**（预览里要把 `anzhiyu://file/{id}`
     * 换成真图地址），而 react-hooks/refs 不允许渲染期读 ref —— 之前那版「ref + 惰性 getter」
     * 仍被判为「把 ref 传进函数，可能在渲染期读它」（post-comments.tsx 的调用点直接报错）。
     * 换成 state 后，渲染期拿到的就是一个普通值，规则无从命中。
     * 更新一律**不可变**（new Map + set + 换引用），满足 react-hooks/immutability。
     *
     * 另有一份 ref 镜像**只给卸载清理用**：revoke 必须在 effect/handler 里做，
     * 不能读渲染期 state（否则 effect 依赖 map，每次上传都会 revoke 掉上一批仍在用的 URL）。
     */
    const [uploadedBlobUrls, setUploadedBlobUrls] = useState<Map<string, string>>(() => new Map());
    const uploadedBlobUrlsRef = useRef(uploadedBlobUrls);

    // 组件卸载：释放预览用的 blob URL（ref 的读取只发生在 effect 里，不在渲染期）
    useEffect(() => {
        const urls = uploadedBlobUrlsRef;
        return () => {
            urls.current.forEach((url) => URL.revokeObjectURL(url));
            urls.current.clear();
        };
    }, []);

    // 挂载时拉一次评论配置：决定是否显示传图按钮、用后端占位文案
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch("/api/public/site-config", { cache: "no-store" });
                const json = (await res.json()) as {
                    data?: {
                        comment?: { allow_image_upload?: boolean; placeholder?: string; emoji_cdn?: string };
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
                if (commentCfg.emoji_cdn) {
                    setEmojiCdn(commentCfg.emoji_cdn);
                }
            } catch {
                // 取不到配置保持默认
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    // 表情包 JSON：第一次打开面板时才拉（见上方 emojiPacks 的说明）
    useEffect(() => {
        if (!emojiOpen || emojiPacks !== null || !emojiCdn) return;
        let cancelled = false;
        (async () => {
            setEmojiLoading(true);
            try {
                // 表情包是静态资源，允许走浏览器缓存（CDN 会给长缓存头）
                const res = await fetch(emojiCdn);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const json = (await res.json()) as Record<
                    string,
                    { container?: Array<{ icon?: string; text?: string }> }
                >;
                if (cancelled) return;
                const packs = parseEmojiPacks(json);
                setEmojiPacks(packs);
                setEmojiPackIndex(0);
                if (packs.length === 0) toast.error("表情包内容为空");
            } catch {
                if (cancelled) return;
                // 记成 []：本次会话不再重试（面板里会显示失败文案）
                setEmojiPacks([]);
                toast.error("表情包加载失败，请检查后台的表情包地址");
            } finally {
                if (!cancelled) setEmojiLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [emojiOpen, emojiPacks, emojiCdn]);

    // 面板的关闭方式：点面板外任意处 / 按 Esc
    useEffect(() => {
        if (!emojiOpen) return;
        const onPointerDown = (event: MouseEvent) => {
            if (emojiWrapRef.current?.contains(event.target as Node)) return;
            setEmojiOpen(false);
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") setEmojiOpen(false);
        };
        document.addEventListener("mousedown", onPointerDown);
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("mousedown", onPointerDown);
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [emojiOpen]);

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

    /** 确认匿名：随机昵称 + 匿名邮箱。邮箱兜底链照官方 CommentSection
     *  （`comment.anonymous_email || frontDesk.siteOwner.email`）的顺序，
     *  再把本项目原有的 comment.blogger_email 留在最后一环（官方链里没有它，仅作兜底）。 */
    async function confirmAnonymous() {
        let anonEmail = "";
        try {
            const res = await fetch("/api/public/site-config", { cache: "no-store" });
            const json = (await res.json()) as {
                data?: {
                    comment?: { anonymous_email?: string; blogger_email?: string };
                    frontDesk?: { siteOwner?: { email?: string } };
                };
            };
            const commentCfg = json?.data?.comment;
            anonEmail =
                commentCfg?.anonymous_email ||
                json?.data?.frontDesk?.siteOwner?.email ||
                commentCfg?.blogger_email ||
                "";
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
            // 本地预览用：把这次上传的文件建成 blob URL，预览里就能看到真图
            // （提交后后端返回的评论列表用的是另一套一次性 URL，不影响这里）
            const key = String(id);
            const previous = uploadedBlobUrlsRef.current.get(key);
            if (previous) URL.revokeObjectURL(previous);
            const blobUrl = URL.createObjectURL(file);
            uploadedBlobUrlsRef.current = new Map(uploadedBlobUrlsRef.current).set(key, blobUrl);
            setUploadedBlobUrls(uploadedBlobUrlsRef.current);
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

    /** 在光标处插入文本（没有焦点信息时退回追加到末尾），插完把光标放到插入内容之后 */
    function insertAtCursor(text: string) {
        const el = contentRef.current;
        if (!el) {
            setContent((prev) => prev + text);
            return;
        }
        const start = el.selectionStart ?? content.length;
        const end = el.selectionEnd ?? start;
        setContent(content.slice(0, start) + text + content.slice(end));
        requestAnimationFrame(() => {
            el.focus();
            const pos = start + text.length;
            el.setSelectionRange(pos, pos);
        });
    }

    /** 插入表情：` :text: `（前后空格见 emojiPacks 的说明）；面板不关，方便连续挑好几个 */
    function insertEmoji(text: string) {
        insertAtCursor(` :${text}: `);
    }

    // 输入框区域最上方的块（决定谁带圆角）：引用 > 回复提示 > 输入框本身
    const topBlock: "quote" | "reply" | "textarea" = quoteText
        ? "quote"
        : replyTarget
            ? "reply"
            : "textarea";

    /**
     * `anzhiyu://file/{id}` → 预览可用的图片地址。
     * 有本地 blob（刚上传的图）就用它显示真图；没有就返回 undefined，
     * 由预览组件显示「图片（提交后由后端解析）」占位文字，而不是一张破图。
     *
     * 这里闭包捕获的是**本次渲染的 state 值** `uploadedBlobUrls`（一个普通 Map，不是 ref），
     * 所以既没有「渲染期读 ref」，也没有「把 ref 传给函数」这两种会被 react-hooks/refs 判错的形式；
     * resolver 身份随 map 变化（上传成功一次、map 换一次引用），而它只是纯查询、不需要稳定身份。
     * 解析结果与原来一致：刚上传的图能取到 blob（state 与 handler 里更新的 ref 镜像同引用，同一批条目），
     * 取不到仍返回 undefined → 预览退化成占位文字。
     */
    const resolvePreviewImageUrl = createAnzhiyuImageUrlResolver({
        get: (fileId) => uploadedBlobUrls.get(fileId),
    });

    /** 当前选中的那包表情（索引越界时退回第一包，避免拉取失败后 index 悬空） */
    const activeEmojiPack = emojiPacks && emojiPacks.length > 0
        ? emojiPacks[Math.min(emojiPackIndex, emojiPacks.length - 1)]
        : null;

    /** `:text:` → 图标：只给 Markdown 预览用（正式评论由后端替换成图片） */
    const emojiMap = useMemo(() => {
        const map = new Map<string, string>();
        emojiPacks?.forEach((pack) => pack.items.forEach((item) => map.set(`:${item.text}:`, item.icon)));
        return map;
    }, [emojiPacks]);

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

                {/* 输入框 + 字数。
                    结构照官方快照 CommentForm.module.css:183-197 的 .textareaWrapper：
                    1px 描边 + 卡片底、文字区四周留白 16px、聚焦时描边转主题色
                    （:focus-within → primary，官方 :195-197）。

                    细节微调（对齐用户给的参考图 scripts/ref-comment-box.png，278×51 的输入框截图）：
                    1) 圆角 14px（rounded-xl）→ rounded-lg。本项目的 --radius=0.625rem(=10px)，
                       所以 rounded-lg 实际是 10px、rounded-md 是 8px、rounded-sm 是 6px
                       （globals.css:52-55 的 calc 派生，不是 Tailwind 默认的 12/8/6）。
                       参考图的圆角约 7px / 框高 28px，按绝对像素取 8px 最接近，
                       但 10px 才与站内「同为卡片」的其它元素严丝合缝 —— 下面三个
                       昵称/邮箱/网址输入框、发送按钮、每条评论的分组卡片全是 rounded-lg(10px)。
                       取 10px 让输入框与这些卡片同一半径族，取 8px 则会比同一行里的三个
                       小输入框更方一点。两种观感都"小圆角"，选协调性更好的 10px。
                    2) 描边颜色：参考图实测是纯黑 #000（抗锯齿 #333/#595959）1px；直接上纯黑太抢，
                       改用半透明前景令牌 border-foreground/25 —— 浅色下叠在白卡上 ≈ #c8c8c8，
                       深色下叠在 #333 卡上 ≈ #646464，两端都恰好是"细、看得见、但不抢"的一档，
                       比默认 --border(#e5e5e5 / 深色 white10%) 清楚，比纯黑克制；
                       且随主题自动换算，不引入新的写死颜色（比 border-[#c9ccd2] 更省心：
                       后者在深色模式会变成一根亮白线）。
                    3) relative 是给右下角的挂件做定位参照。 */}
                <div className="relative mt-3 rounded-lg border border-foreground/25 bg-card transition-colors focus-within:border-primary">
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
                    {/* 内边距口径照官方 .textareaInner（CommentForm.module.css:203-215）：
                        文字区自身留白 + 最小高度 120px，16px 的容器内边距由外层给。
                        placeholder 颜色：参考图里那排占位文字是蓝调（实测 #687fb4 / #8b9cc6），
                        原来是纯灰 muted-foreground/60（白底上 ≈ #ababab）。改成挂件同源的
                        蓝色 #566cad 打 50% 透明（白底 ≈ #abb6d6）：亮度与原灰几乎一致，
                        只多一点冷色倾向，和评论区左右两条蓝边、右下角的小鱼同色系；
                        深色底同理用提亮版 #8599d6，避免 #566cad 在暗底上糊掉。 */}
                    <textarea
                        ref={contentRef}
                        rows={5}
                        maxLength={500}
                        placeholder={replyTarget ? `回复 @${replyTarget.nickname}…` : commentPlaceholder}
                        aria-label="评论内容"
                        value={content}
                        onChange={(event) => setContent(event.target.value)}
                        className={`min-h-[120px] w-full resize-none bg-transparent px-4 pt-4 pb-3 text-sm leading-relaxed outline-none placeholder:text-[#566cad]/50 dark:placeholder:text-[#8599d6]/60 ${
                            topBlock === "textarea" ? "rounded-t-lg" : ""
                        }`}
                    />
                    {/* 工具栏：左侧传图按钮、右侧字数。
                        左右各留 padding：左侧传图按钮与右侧「0 / 500」各占一端，互不干扰。

                        预览打开时工具栏不再是容器最后一块，底部圆角交给下面的预览面板。 */}
                    <div className={`flex items-center justify-between border-t py-2 px-3 ${previewOpen ? "" : "rounded-b-lg"}`}>
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
                            {/* 紧挨「插入图片」：表情包入口（后台配了 comment.emoji_cdn 才显示）。
                                面板向上展开（工具栏在输入框底部，向下会把下面的昵称/发送按钮挡住），
                                左对齐到按钮本身；里面的图都是 CDN 上的小图，统一 lazy 加载。 */}
                            {emojiCdn ? (
                                <div className="relative" ref={emojiWrapRef}>
                                    <button
                                        type="button"
                                        onClick={() => setEmojiOpen((open) => !open)}
                                        aria-expanded={emojiOpen}
                                        aria-haspopup="dialog"
                                        aria-label={emojiOpen ? "关闭表情面板" : "打开表情面板"}
                                        title={emojiOpen ? "关闭表情面板" : "插入表情"}
                                        className={`rounded-md p-1.5 transition-colors hover:bg-muted hover:text-foreground ${emojiOpen ? "bg-muted text-foreground" : "text-muted-foreground"
                                            }`}
                                    >
                                        <Smile className="size-4" />
                                    </button>
                                    {emojiOpen && (
                                        <div
                                            role="dialog"
                                            aria-label="表情选择器"
                                            className="absolute bottom-full left-0 z-50 mb-2 w-[min(19rem,calc(100vw-3rem))] overflow-hidden soft-surface shadow-lg"
                                        >
                                            {emojiLoading ? (
                                                <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
                                                    表情加载中…
                                                </div>
                                            ) : activeEmojiPack ? (
                                                <>
                                                    <div className="grid max-h-48 grid-cols-7 gap-0.5 overflow-y-auto p-2">
                                                        {activeEmojiPack.items.map((item) => (
                                                            <button
                                                                key={item.text}
                                                                type="button"
                                                                title={item.text}
                                                                onClick={() => insertEmoji(item.text)}
                                                                className="flex h-9 items-center justify-center rounded-md transition-colors hover:bg-muted"
                                                            >
                                                                {/* 表情是 CDN 上的小图（28px），next/image 的优化流程在这里没收益，
                                                                    而且每包上百张、还要给每个 CDN 域名配 remotePatterns */}
                                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                                <img
                                                                    src={item.icon}
                                                                    alt={item.text}
                                                                    loading="lazy"
                                                                    className="size-7 object-contain"
                                                                />
                                                            </button>
                                                        ))}
                                                    </div>
                                                    {/* 底部包切换：横向滚动，图标用包名 HTML 里的那张图 */}
                                                    <div className="flex gap-1 overflow-x-auto border-t p-1.5">
                                                        {emojiPacks?.map((pack, index) => (
                                                            <button
                                                                key={`${pack.name}-${index}`}
                                                                type="button"
                                                                title={pack.name}
                                                                aria-pressed={index === emojiPackIndex}
                                                                onClick={() => setEmojiPackIndex(index)}
                                                                className={`flex size-9 shrink-0 items-center justify-center rounded-md transition-colors ${index === emojiPackIndex ? "bg-muted" : "hover:bg-muted"
                                                                    }`}
                                                            >
                                                                {pack.icon ? (
                                                                    <>
                                                                        {/* 同上：表情包切换条的小图标，走 CDN 原图 */}
                                                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                                                        <img
                                                                            src={pack.icon}
                                                                            alt={pack.name}
                                                                            loading="lazy"
                                                                            className="size-6 object-contain"
                                                                        />
                                                                    </>
                                                                ) : (
                                                                    <span className="text-[10px]">{pack.name.slice(0, 2)}</span>
                                                                )}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </>
                                            ) : (
                                                <div className="flex h-32 items-center justify-center px-4 text-center text-xs text-muted-foreground">
                                                    没有可用的表情
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ) : null}
                            {/* 紧挨「插入图片」：Markdown 预览开关（纯前端状态，不提交任何东西） */}
                            <button
                                type="button"
                                onClick={() => setPreviewOpen((open) => !open)}
                                aria-pressed={previewOpen}
                                className={`rounded-md p-1.5 transition-colors hover:bg-muted hover:text-foreground ${previewOpen
                                    ? "bg-muted text-foreground"
                                    : "text-muted-foreground"
                                    }`}
                                title={previewOpen ? "关闭 Markdown 预览" : "Markdown 预览"}
                                aria-label={previewOpen ? "关闭 Markdown 预览" : "Markdown 预览"}
                            >
                                {previewOpen ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                            </button>
                        </div>
                        <span className="text-xs tabular-nums text-muted-foreground">
                            {content.length}
                            <span className="mx-0.5 text-muted-foreground/60">/</span>500
                        </span>
                    </div>
                    {/* Markdown 预览：输入框容器内部底部（工具栏之下）。
                        为什么放容器里面而不是容器正下方：视觉上它就是这块「评论输入区」的一部分，
                        与输入框共用一层描边，且能自然接管容器底部的圆角；放到容器外面会多出一条
                        独立的边线，看起来像另一个区块。 */}
                    {previewOpen && (
                        <CommentMarkdownPreview
                            markdown={content}
                            resolveImageUrl={resolvePreviewImageUrl}
                            emoji={emojiMap}
                        />
                    )}
                </div>

                {/* 表单信息行：未登录时显示昵称 / 邮箱 / 网址输入（登录态下这三项取自账号，无输入框、也不再显示提示文案）。
                    排版口径：
                      · 移动端 —— 三个输入各自一行（左标签 + 右输入），发送按钮**单独一行、撑满整宽**；
                        旧版是把按钮塞在右侧并把高度撑满三行，手机上会变成一根竖长条 + 右侧大片空白。
                      · ≥sm —— 三个输入一行，按钮靠右、与输入框同高。 */}
                <div className="mt-3 space-y-3">
                    {loggedIn ? null : (
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                            <label className="flex items-center gap-2 sm:block">
                                <span className="block shrink-0 text-xs text-muted-foreground sm:mb-1">昵称</span>
                                <input
                                    type="text"
                                    autoComplete="nickname"
                                    placeholder="必填"
                                    value={nickname}
                                    readOnly={anonActive}
                                    onChange={(event) => setNickname(event.target.value)}
                                    className="h-9 w-full min-w-0 flex-1 soft-surface px-3 text-sm outline-none transition-colors focus:border-primary read-only:cursor-not-allowed read-only:opacity-70 sm:flex-none"
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
                                    className="h-9 w-full min-w-0 flex-1 soft-surface px-3 text-sm outline-none transition-colors focus:border-primary read-only:cursor-not-allowed read-only:opacity-70 sm:flex-none"
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
                                    className="h-9 w-full min-w-0 flex-1 soft-surface px-3 text-sm outline-none transition-colors focus:border-primary sm:flex-none"
                                />
                            </label>
                        </div>
                    )}
                    {/* 发送按钮：移动端整宽独占一行，≥sm 靠右与输入框同高 */}
                    <div className="flex justify-end">
                        <button
                            type="button"
                            disabled={submitting}
                            onClick={handleSubmit}
                            className="inline-flex h-9 w-full shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                        >
                            <Send className="size-3.5" />
                            {submitting ? "发送中…" : "发送"}
                        </button>
                    </div>
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
                        className="w-full max-w-sm soft-surface p-5 shadow-lg"
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
