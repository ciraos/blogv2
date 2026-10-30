"use client";

import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";

/**
 * 评论 Markdown 预览（仅用于评论区输入框的「预览」开关，不改动任何提交链路）。
 *
 * 渲染器：复用本仓已安装的 `@uiw/react-md-editor` 的预览组件
 * （它的默认导出上挂着 `Markdown`，就是 `@uiw/react-markdown-preview` 的组件；
 * 后台文章编辑器 `src/components/admin/markdown-editor.tsx:11` 用的正是同一个包）。
 * 因此这里**没有新增依赖**，也没有新造一套 Markdown 解析器、没有第二份 react-markdown。
 *
 * 它内部是 `react-markdown` + `remark-gfm` + `rehype-raw/slug/autolink/ignore/attr/rewrite`
 * + `rehype-prism-plus`；`skipHtml` 默认 true，所以评论里手写的原始 HTML 只会以文本出现，
 * 不会被注入 —— 预览区是安全的（不引入新的 XSS 面）。另外 react-markdown 默认的
 * `urlTransform` 会拦掉非白名单协议，所以这里显式传一个直通实现，否则
 * `anzhiyu://file/{id}` 这类内部协议会被清成空 src。
 *
 * 另注：本文件里的 `import("@uiw/react-md-editor")` 是**动态**导入，只有用户点开预览那一刻
 * 才会下载该 chunk；但它会把该包自带的 `markdown.css`（.wmde-markdown 皮肤）一并注入全局，
 * 这是唯一一处「全局样式副作用」，我们只在本组件内部覆盖它，没有改 globals.css。
 */

/** 预览区里「后端解析后才有真实地址」的占位提示（见 post-comments.tsx 里的调用注释） */
export const IMAGE_PLACEHOLDER_TEXT = "图片（提交后由后端解析）";

/**
 * 输入框里的 `![alt](anzhiyu://file/{id})` → 可显示 URL 的本地映射。
 * 上传成功后前端只知道文件 ID，真实 URL 由后端在返回评论列表时用一次性签名地址解析
 * （scripts/anheyu/anheyu-app-main/pkg/service/comment/service.go:1078-1135，URL 有效期 1 小时），
 * 前端**无法**本地复现；所以照官方主题的做法（theme-anheyu-next-main
 * src/components/post/Comment/CommentForm.tsx:380-383）在本地为刚上传的文件建一个 blob URL，
 * 预览里用它显示真图；取不到时退化成占位提示而不是一张破图。
 */
export function createAnzhiyuImageUrlResolver(
    blobUrls: { get: (fileId: string) => string | undefined }
): (url: string) => string | undefined {
    return (url) => {
        const fileId = /^anzhiyu:\/\/file\/([A-Za-z0-9_-]+)$/.exec(url.trim())?.[1];
        if (!fileId) return undefined;
        return blobUrls.get(fileId);
    };
}

/**
 * 表情占位（`:heo-害羞:`）→ Markdown 图片，供**预览**显示真实表情。
 *
 * 正式评论里这步由后端做（`pkg/service/parser` 的 emojiReplacer 把 `:text:` 换成
 * `<img class="anzhiyu-owo-emotion">`），前端拿不到渲染后的 HTML，所以预览自己按同一份
 * 表情包映射替换一次；`![alt](icon)` 的 alt 就是表情名，渲染后再由 rehypeRewrite 打上
 * 同一个类名，CSS 就会把它显示成行内小图标。
 *
 * 代码块 / 行内代码里的 `:text:` 不替换（那里是源码，替换掉反而看不懂），
 * 所以先按围栏代码块与反引号切段，只处理非代码段。
 */
function replaceEmojiMarkdown(markdown: string, emoji: Map<string, string>): string {
    if (emoji.size === 0 || !markdown.includes(":")) return markdown;
    const keys = Array.from(emoji.keys()).sort((a, b) => b.length - a.length);
    const pattern = new RegExp(keys.map((key) => key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "g");
    return markdown
        .split(/(```[\s\S]*?```|`[^`\n]*`)/g)
        .map((part) => {
            if (part.startsWith("```")) return part;
            if (part.startsWith("`") && part.endsWith("`")) return part;
            return part.replace(pattern, (match) => `![${match.slice(1, -1)}](${emoji.get(match)})`);
        })
        .join("");
}

/** 空映射（默认值，避免每次渲染都新建一个 Map 让依赖抖动） */
const NO_EMOJI = new Map<string, string>();

/** rehype-rewrite 回调会用到的节点字段（自己声明，避免依赖传递包的内部类型） */
interface RewriteNode {
    type?: string;
    tagName?: string;
    properties?: Record<string, unknown>;
    children?: RewriteNode[];
    /** 文本节点等其它字段 */
    [key: string]: unknown;
}

/** 文本节点（占位提示用） */
function textNode(value: string): RewriteNode {
    return { type: "text", value };
}

/**
 * 把预览里的 `anzhiyu://file/{id}` 图片替换成真实 blob URL / 占位提示。
 * 通过 MarkdownPreview 的 `rehypeRewrite` 传入：它在库自带的 rewrite（标题锚点、代码块复制按钮）
 * 之后被调用（rehypePlugins.js:10-25），所以这里只动 img 节点，不影响其它增强。
 */
function rewriteInternalImages(resolveImageUrl: (url: string) => string | undefined, emojiIcons?: Set<string>) {
    return (node: RewriteNode): void => {
        if (node.type !== "element" || node.tagName !== "img" || !node.properties) return;
        const rawSrc = node.properties.src;
        if (typeof rawSrc !== "string") return;
        // 表情图：打上后端用的同一个类名，交给 globals.css 显示成行内小图标
        if (emojiIcons?.has(rawSrc)) {
            node.properties.className = ["anzhiyu-owo-emotion"];
            return;
        }
        if (!rawSrc.startsWith("anzhiyu://file/")) return;

        const fileId = /^anzhiyu:\/\/file\/([A-Za-z0-9_-]+)/.exec(rawSrc)?.[1] ?? "";
        const blobUrl = resolveImageUrl(rawSrc);
        if (!blobUrl) {
            // 没拿到本地 blob：不显示破图，改成一句话说明（alt 里的文字优先，方便认出是哪张图）
            const alt = typeof node.properties.alt === "string" && node.properties.alt.trim() ? node.properties.alt.trim() : "";
            node.tagName = "span";
            node.properties = { "data-anzhiyu-file-id": fileId };
            node.children = [textNode(alt ? `${IMAGE_PLACEHOLDER_TEXT}：${alt}` : IMAGE_PLACEHOLDER_TEXT)];
            return;
        }
        node.properties.src = blobUrl;
        // 只有一张图，去掉可能存在的 srcSet（它里面还是内部协议）
        delete node.properties.srcSet;
        delete node.properties.srcset;
    };
}

/** 极简 Markdown → 被转义的纯文本（仅在动态加载预览渲染器失败时兜底，不引入任何 HTML） */
function toEscapedPlainText(markdown: string): string {
    return markdown
        .replace(/\r\n/g, "\n")
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, (_m, alt: string) =>
            alt.trim() ? `［${IMAGE_PLACEHOLDER_TEXT}：${alt.trim()}］` : `［${IMAGE_PLACEHOLDER_TEXT}］`
        )
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
        .replace(/`{1,3}/g, "")
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .replace(/\*([^*]+)\*/g, "$1")
        .replace(/^>\s?/gm, "")
        .replace(/^#{1,6}\s*/gm, "");
}

/** 渲染器加载形态：@uiw/react-md-editor 的 `Markdown` 导出（即 @uiw/react-markdown-preview 的组件） */
type MarkdownRenderer = ComponentType<{
    source?: string;
    skipHtml?: boolean;
    /** wrapper 的 class（库用顶层 className，wrapperElement.className 会被丢弃） */
    className?: string;
    urlTransform?: (url: string) => string;
    rehypeRewrite?: (node: RewriteNode) => void;
    wrapperElement?: React.DetailedHTMLProps<React.HTMLAttributes<HTMLDivElement>, HTMLDivElement> & {
        "data-color-mode"?: "light" | "dark";
    };
}>;

interface CommentMarkdownPreviewProps {
    /** 输入框里的 Markdown 原文 */
    markdown: string;
    /** `anzhiyu://file/{id}` → 本地预览 URL（取不到则显示占位提示） */
    resolveImageUrl: (url: string) => string | undefined;
    /**
     * 表情包映射：`:text:` → 图标 URL（来自后台 comment.emoji_cdn 指向的 JSON）。
     * 不传 = 预览里不转换表情（显示原始 `:text:`）。
     */
    emoji?: Map<string, string>;
}

/**
 * 深浅色口径：看 `<html>` 上有没有 `dark` 类 —— 这就是本站主题的唯一真相
 * （next-themes 配的 attribute="class"，见 src/app/(blog)/layout.tsx:116；globals.css 也全按 .dark 分支）。
 * 为什么不用 next-themes 的 resolvedTheme：本站同时开了 enableSystem + 定时主题，
 * resolvedTheme 与真正落地的 class 可能不同步（实测浅色页面上 resolvedTheme 仍报 "dark"），
 * 而预览配色必须和眼前这块输入框一致，所以直接观察 class 本身。
 * 用 MutationObserver 跟随主题切换（与 admin/markdown-editor.tsx:79-88 同一做法）。
 */
function useHtmlDarkClass(): boolean {
    const [isDark, setIsDark] = useState(false);
    useEffect(() => {
        const root = document.documentElement;
        // 初始读到的是主题已落地的值（预览面板只在用户点开时才挂载，不存在首屏闪烁问题）——
        // 这里保留「effect 里同步读一次」而不是推迟到下一个 tick：推迟会让深色主题下第一帧先按
        // data-color-mode="light" 出图，再翻成 dark，白白闪一下（库的皮肤变量挂在 data-color-mode 上）。
        // 这条调用不经过 setState 的直接调用形式，react-hooks/set-state-in-effect 不会报它，
        // 所以原来那行 `eslint-disable-next-line` 已经是多余指令（unused directive），本次删掉。
        const sync = () => setIsDark(root.classList.contains("dark"));
        sync();
        const observer = new MutationObserver(sync);
        observer.observe(root, { attributes: true, attributeFilter: ["class"] });
        return () => observer.disconnect();
    }, []);
    return isDark;
}

export function CommentMarkdownPreview({ markdown, resolveImageUrl, emoji }: CommentMarkdownPreviewProps) {
    const [Renderer, setRenderer] = useState<MarkdownRenderer | null>(null);
    const [loadFailed, setLoadFailed] = useState(false);
    const loadingRef = useRef(false);
    const colorMode: "light" | "dark" = useHtmlDarkClass() ? "dark" : "light";

    const emojiMap = emoji ?? NO_EMOJI;
    /** 预览用的 Markdown：先把 `:text:` 换成表情图片（见 replaceEmojiMarkdown） */
    const source = useMemo(() => replaceEmojiMarkdown(markdown, emojiMap), [markdown, emojiMap]);
    /** 表情图标的 URL 集合：rehypeRewrite 靠它认出「这是表情，不是用户上传的图」 */
    const emojiIcons = useMemo(() => new Set(emojiMap.values()), [emojiMap]);

    /**
     * 预览渲染器按需动态加载：只有用户点开预览才会下载这块 chunk（不进首屏包）。
     *
     * 为什么从 `@uiw/react-md-editor` 拿而不是直接 import `@uiw/react-markdown-preview`：
     * 本仓是 pnpm，`@uiw/react-markdown-preview` 只是 md-editor 的**传递依赖**，顶层
     * node_modules 里没有它的软链，应用根部 import 它解析不到（实测 ERR_MODULE_NOT_FOUND）。
     * 而 md-editor 的默认导出上就挂着同一个组件（`ESM: default.Markdown`，类型见
     * @uiw/react-md-editor/esm/Editor.d.ts），且 md-editor 本身就是后台文章编辑器在用的直接依赖
     * （src/components/admin/markdown-editor.tsx:11）。这样既复用了同一套渲染器，又没有新增依赖、
     * 也不会打进第二份 react-markdown。
     */
    useEffect(() => {
        if (Renderer || loadingRef.current) return;
        loadingRef.current = true;
        let cancelled = false;
        void (async () => {
            try {
                const mod = (await import("@uiw/react-md-editor")) as unknown as {
                    default: { Markdown: MarkdownRenderer };
                };
                const Md = mod.default?.Markdown;
                if (!Md) throw new Error("@uiw/react-md-editor 没有 Markdown 导出");
                if (!cancelled) setRenderer(() => Md);
            } catch {
                if (!cancelled) setLoadFailed(true);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [Renderer]);

    const empty = markdown.trim().length === 0;

    return (
        <div
            data-comment-preview=""
            className="rounded-b-lg border-t bg-muted/30 px-3 py-2"
            aria-live="polite"
        >
            <div className="mb-1 text-[11px] font-medium text-muted-foreground">预览（Markdown 渲染结果）</div>
            {/* 这里不加 .article-body：那是「整篇正文」的排版作用域（首字下沉、标题 48px 上边距、
                图片阴影、.tabs 等，globals.css:357-940），套在评论预览上会串味；
                预览只需要「块内排版自洽」，所以用作用域内的 Tailwind 变体补间距/字号，
                再借用 globals.css 里与评论区共用的一套皮肤（:is(.article-body,.comment-content)
                的代码块规则 = globals.css:942 起）。 */}
            <div className="text-sm leading-relaxed">
                {empty ? (
                    <p className="text-muted-foreground">预览区：先输入一些内容</p>
                ) : loadFailed ? (
                    <pre className="m-0 whitespace-pre-wrap break-words border-0 bg-transparent p-0 font-[inherit] text-sm text-muted-foreground">
                        {toEscapedPlainText(markdown)}
                    </pre>
                ) : Renderer ? (
                    <Renderer
                        source={source}
                        skipHtml
                        /**
                         * 皮肤覆盖必须走**顶层 className**，不能放 wrapperElement.className：
                         * 这个组件把 className 拼成 wrapper 的 class（库自己会加 `wmde-markdown
                         * wmde-markdown-color`，所以这里不重复写），而 wrapperElement.className 会被
                         * 它的 previewOptions 覆盖掉 —— 实测 wrapperElement 上只有 data-color-mode 生效。
                         * `!` 强制覆盖库自带的 padding / 白底 / GitHub 字号
                         * （@uiw/react-markdown-preview 的 markdown.css:211-218）。
                         */
                        className={
                            "!p-0 !bg-transparent !font-[inherit] !text-sm !leading-relaxed " +
                            "[&_h1]:mt-3! [&_h1]:mb-1.5! [&_h1]:text-lg! [&_h2]:mt-3! [&_h2]:mb-1.5! [&_h2]:text-base! " +
                            "[&_h3]:mt-2! [&_h3]:mb-1! [&_h3]:text-[0.95rem]! [&_h4]:mt-2! [&_h4]:mb-1! [&_h4]:text-sm! " +
                            "[&_p]:my-1.5! [&_ul]:my-1.5! [&_ol]:my-1.5! [&_pre]:my-2! " +
                            // 表情图不参与「图片」的块级间距（它要行内显示，见 globals.css 的 .anzhiyu-owo-emotion）
                            "[&_img:not(.anzhiyu-owo-emotion)]:my-2! [&_img:not(.anzhiyu-owo-emotion)]:max-w-full"
                        }
                        /* 直通 URL 变换：库默认实现会拦掉 anzhiyu:// 这类内部协议 */
                        urlTransform={(url) => url}
                        /**
                         * 这里直接把 resolveImageUrl 这个 prop 交给 rewriteInternalImages，不再绕一个
                         * `useRef(resolveImageUrl)` + effect 同步的“读最新值”层：那层是为了让回调拿到最新的
                         * resolver，但它必须在渲染期读 `resolverRef.current`，而 react-hooks/refs 会判为
                         * 「渲染期读 ref」（且这个调用结果正好被插进 JSX，属于最严格的那条检查路径）。
                         * 直接把 prop 闭包进去是等价的：rewrite 每次渲染都是新函数（原来那层也没能做到稳定身份），
                         * rehype 重写发生在渲染期，拿到的本来就是本次渲染的 resolver；
                         * 调用方 post-comments.tsx 传进来的 resolver 读的是同一个 blob Map，语义不变。
                         */
                        rehypeRewrite={rewriteInternalImages(resolveImageUrl, emojiIcons)}
                        wrapperElement={{ "data-color-mode": colorMode }}
                    />
                ) : (
                    <p className="text-muted-foreground">预览渲染中…</p>
                )}
            </div>
        </div>
    );
}
