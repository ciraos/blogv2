import { createElement, type ComponentType } from "react";

import {
    buildTabsHtml,
    renderMathInHtml,
    renderShortcodesToHtml,
    splitTabsBlocks,
} from "@/lib/article-shortcodes-render";

/**
 * 正文 Markdown → HTML（保存文章时提交给后端的 `content_html`）。
 *
 * ── 为什么必须在**前端**渲染 ────────────────────────────────────────────────
 * 后端不渲染 Markdown：`internal/pkg/parser/markdown.go:58` 的 `MarkdownToHTML()` 全仓库没有调用点。
 * 创建 / 更新文章时它只对请求里带来的 HTML 做净化：
 *   - 创建：pkg/service/article/service.go:1143-1146 → `SanitizeHTML(req.ContentHTML)`
 *   - 更新：pkg/service/article/service.go:1505-1507 → `SanitizeHTML(*req.ContentHTML)`
 * 而官方后台的编辑器是 Tiptap，本来就是**直接产出 HTML** 再提交
 * （scripts/theme/theme-anheyu-next-main/src/components/admin/article-editor/ArticleEditorPage.tsx:167,186
 * 的 `content_html: html`）。我们的后台只提交 `content_md`，于是库里 `content_html` 为空，
 * 前台 `src/app/(blog)/posts/[id]/page.tsx:263` 渲染 `article.content_html || ""` → 正文空白。
 * 所以：保存前在这里把 `content_md` 渲染成 HTML，随载荷一起提交。
 *
 * ── 用的哪个渲染器 ────────────────────────────────────────────────────────
 * 复用后台编辑器已经在用的 `@uiw/react-md-editor`（默认导出上挂着的 `Markdown` 就是
 * `@uiw/react-markdown-preview` 的组件，内部是 react-markdown + remark-gfm +
 * rehype-raw/slug/autolink/ignore/attr/rewrite + rehype-prism-plus）。
 * **没有新增任何依赖**，也没有第二份 react-markdown；之所以从 md-editor 拿而不是直接 import
 * `@uiw/react-markdown-preview`：本仓是 pnpm，后者只是 md-editor 的传递依赖，顶层解析不到
 * （同 src/components/(blog)/comment-preview.tsx:160-166 踩过的坑）。
 *
 * 要拿到 HTML **字符串**（而不是 React 元素）用 `react-dom/server` 的 `renderToStaticMarkup`。
 * 这必须发生在客户端：`Markdown` 组件依赖 DOM（编辑器本体一直是 `dynamic(..., { ssr: false })`）。
 *
 * ── bundle 影响 ───────────────────────────────────────────────────────────
 * 两个模块都用**动态 import**（`react-dom/server` + `@uiw/react-md-editor`）：
 *   - `@uiw/react-md-editor` 本来就被 src/components/admin/markdown-editor.tsx:11 动态加载，
 *     浏览器里是同一份 chunk，**不新增**；
 *   - `react-dom/server` 会多一块懒加载 chunk（浏览器版 server.browser：268KB 未压缩 / ≈47KB gzip），
 *     只在「打开预览 / 点保存」时才下载，不进后台首屏包。
 * 不能改成静态 import：那会让 md-editor 进入服务端渲染图，编辑器加载即报 window 未定义。
 *
 * ── 安全 ─────────────────────────────────────────────────────────────────
 * 渲染器带 rehype-raw，Markdown 里手写的原始 HTML 会被解析成真实元素 —— 这是**需要**的：
 * 前台 article-body.tsx 的 tabs / 折叠 / 密码 / 提示等增强语法就是自定义 HTML。
 * 但脚本类标签必须挡掉（见 MARKDOWN_DISALLOWED_ELEMENTS），地址走白名单（见 safeUrlTransform），
 * 最后再兜一层属性清理（见 normalizeRenderedHtml）。后端还会 SanitizeHTML 一次，但存进去的
 * 东西本身就不该带危险内容。
 */

/**
 * 不允许出现在正文 HTML 里的标签。
 * script/style/iframe/object/embed/form/link/meta/base/noscript/template 及老式 frame 系列：
 * 存进库后会被前台 `dangerouslySetInnerHTML` 注入，属于必须挡掉的注入面。
 * svg / button 一并去掉：它们是渲染器自带的「标题锚点图标」与「代码块复制按钮」，
 * 正文里不需要（前台 ArticleBody 会自己生成 .heading-anchor 与复制按钮）。
 */
export const MARKDOWN_DISALLOWED_ELEMENTS: string[] = [
    "script",
    "style",
    "iframe",
    "object",
    "embed",
    "form",
    "link",
    "meta",
    "base",
    "noscript",
    "template",
    "frame",
    "frameset",
    "applet",
    "svg",
    "button",
];

/** 放行的协议（其余一律拦掉、返回 null） */
const SAFE_PROTOCOL = /^(?:https?|mailto|tel):/i;
/** 放行的 data URI：只允许位图（data:image/svg+xml 里可以带脚本，不放） */
const SAFE_DATA_IMAGE = /^data:image\/(?:png|jpe?g|gif|webp|avif)[;,]/i;

/**
 * 链接 / 图片地址白名单（纯函数：url → url）。
 *
 * 为什么不用渲染器的默认行为：`@uiw/react-markdown-preview` 把 `urlTransform` 默认成了直通
 * （preview.js:16 `defaultUrlTransform = url => url`），`javascript:` / `data:text/html` 会原样留下；
 * React 虽然会把 `javascript:` 换成「React has blocked a javascript: URL…」的占位串，但那串东西
 * 会**被存进库**。这里只放行 http(s)/mailto/tel、站内相对地址、位图 data URI。
 *
 * 拦下的地址返回 **null**（不是空串）：react-markdown 会把 null 直接写进 hast 属性，
 * hast-util-to-jsx-runtime 于是整个丢掉这个属性 —— 输出里既没有 `javascript:`，
 * 也不会留下 `src=""`（空 src 会让浏览器重新请求当前页面，React 还会为此打一条 error）。
 */
export function safeUrlTransform(url: string): string | null {
    const value = (url ?? "").trim();
    if (!value) return null;
    if (SAFE_DATA_IMAGE.test(value)) return value;
    const colon = value.indexOf(":");
    const slash = value.indexOf("/");
    // 没有协议（站内相对路径 / #锚点 / ?query），或第一个 ":" 在 "/" 之后（//host/x）→ 放行
    if (colon === -1 || (slash !== -1 && colon > slash)) return value;
    return SAFE_PROTOCOL.test(value.slice(0, colon + 1)) ? value : null;
}

/**
 * 把 renderToStaticMarkup 的输出整理成「可直接存库的正文片段」（纯函数：html → html）。
 *
 * 1) 去掉外层 wrapper：组件把自己的输出包在 `<div class="wmde-markdown …">` 里，而官方后台存的是
 *    Tiptap 产出的裸片段（`<p>` / `<h2>` / …），前台 `.article-body` 也按片段排版。
 *    另外 React 19 会把 `<img>` 提升成 `<link rel="preload">` 放在 wrapper **之前**，一并切掉。
 * 2) 去掉标题锚点：渲染器给每个标题加了 `<a class="anchor">` + octicon 图标（svg 已被
 *    disallowedElements 去掉，只剩空标签）；前台 enhanceHeadings() 会自己生成 .heading-anchor，
 *    留着会多一个空链接。标题上的 `id` 保留（前台会复用这个 id 供 toc / 锚点跳转）。
 * 3) 去掉残留的 `src=""` / `href=""`：safeUrlTransform 已经用 null 让危险地址整个消失，
 *    这一步是给「Markdown 里手写的原始 HTML 自带空 src」兜底（空 src 会让浏览器重新请求当前页）。
 * 4) 兜底：HTML 注释、脚本/样式块、`on*` 事件属性一律清掉。
 *
 * 注意：这里**不动换行**——`<pre>` 里的换行是有意义的。
 */
export function normalizeRenderedHtml(raw: string): string {
    let html = (raw ?? "").trim();
    // 只在「整段输出确实是一个以 </div> 收尾的 wrapper div」时才拆（first <div> … last </div>）。
    // 渲染器以后若不再套 wrapper，这里整体跳过：宁可留一点噪声，也绝不切掉正文。
    const close = html.lastIndexOf("</div>");
    if (close !== -1 && close + "</div>".length === html.length) {
        const open = html.indexOf("<div");
        if (open !== -1 && open < close) html = html.slice(open, close).replace(/^<div[^>]*>/, "");
    }
    return html
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(/<a\b[^>]*class="anchor"[^>]*>\s*<\/a>/g, "")
        .replace(/<script\b[\s\S]*?<\/script>/gi, "")
        .replace(/<style\b[\s\S]*?<\/style>/gi, "")
        .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
        .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "")
        .replace(/\s(?:src|href)=""/g, "")
        .trim();
}

/**
 * 渲染结果是否「实际没有正文」（纯函数：html → boolean）。
 *
 * 用途：提交前拦住「md 有内容、HTML 却是空的」——那种请求会把正文写成空，必须挡在发出之前。
 * 剥掉标签 / 注释 / &nbsp; 后还剩没剩东西；img / video / table 这类元素本身就是内容，
 * 先换成占位字符，免得「一篇只有图片的正文」被误判成空。
 */
export function isRenderedHtmlEmpty(html: string): boolean {
    if (!html) return true;
    const text = html
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(/<(?:img|video|audio|table|iframe|hr|br)\b[^>]*>/gi, "x")
        .replace(/<[^>]*>/g, "")
        .replace(/&nbsp;/gi, " ")
        .replace(/\s+/g, "");
    return text.length === 0;
}

/**
 * 丢掉 rehype-prism-plus 这一环（纯函数）。
 *
 * 为什么：代码块高亮由**前台**做（src/lib/code-block.ts 的 enhanceBlock 用 highlight.js 重写
 * `<code>` 的 innerHTML），存库时再带一份 prism 的 `<span class="token …">` 只是：
 * ① 让 content_html 体积膨胀 2~3 倍；② 前台又会整段覆盖掉。
 * 只认「唯一的选项对象就是 { ignoreMissing: true }」这一个特征——那是 md-editor 加 prism 时写死的
 * （@uiw/react-markdown-preview/esm/index.js 里 `[rehypePrism, { ignoreMissing: true }]`），
 * 与同列表里的 rehype-attr（`{properties:'attr'}`）/ rehype-rewrite（`{rewrite: fn}`）不会撞。
 * 库以后若改了写法，这里就匹配不到、等于不过滤：只是体积大一点，不会渲染错。
 */
function dropPrismHighlightPlugins<P>(type: "rehype" | "remark", plugins: P): P {
    if (type !== "rehype" || !Array.isArray(plugins)) return plugins;
    const kept = (plugins as unknown[]).filter((entry) => {
        if (!Array.isArray(entry) || entry.length !== 2) return true;
        const options = entry[1];
        if (!options || typeof options !== "object") return true;
        const keys = Object.keys(options);
        return !(keys.length === 1 && (options as { ignoreMissing?: unknown }).ignoreMissing === true);
    });
    // 这里必须是「泛型原样返回」：pluginsFilter 的签名是 (type, PluggableList) => PluggableList，
    // 用 unknown[] 做参数/返回值都对不上（PluggableList 是 Plugin | [Plugin, ...unknown[]] 的数组）。
    return kept as unknown as P;
}

type MarkdownToHtml = (markdown: string) => string;

/**
 * 渲染器组件的类型。
 * 刻意用「宽松的组件类型」而不是 `MarkdownPreviewProps`：那些 props 类型来自
 * `@uiw/react-markdown-preview`（传递依赖，pnpm 下顶层解析不到，只能靠 md-editor 的 d.ts 间接引用）。
 * 这里只关心我们真正传的 5 个 props，它们的行为由 scripts/article-html-test.cjs 实测覆盖，
 * 比拴在别人的 d.ts 上更稳。
 */
type MarkdownComponent = ComponentType<Record<string, unknown>>;

/** 渲染器只加载一次（失败时清掉，允许下次重试） */
let rendererPromise: Promise<MarkdownToHtml> | null = null;

/** 正文渲染失败（渲染器加载不出来 / 渲染本身抛错）。调用方用它区分「渲染失败」与「请求失败」的提示。 */
export class ArticleRenderError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ArticleRenderError";
    }
}

/** 按需加载渲染器两个模块；失败时把原因带出去（保存时会原样提示，便于定位是哪个 chunk 没到位） */
async function importRendererModules() {
    try {
        return await Promise.all([import("react-dom/server"), import("@uiw/react-md-editor")]);
    } catch (error) {
        throw new ArticleRenderError(`正文渲染器加载失败：${error instanceof Error ? error.message : String(error)}`);
    }
}

async function createRenderer(): Promise<MarkdownToHtml> {
    const [server, editor] = await importRendererModules();
    const Markdown = editor.default?.Markdown as unknown as MarkdownComponent | undefined;
    if (typeof server.renderToStaticMarkup !== "function") {
        throw new ArticleRenderError("正文渲染器不可用：react-dom/server 没有导出 renderToStaticMarkup");
    }
    if (!Markdown) {
        throw new ArticleRenderError("正文渲染器不可用：@uiw/react-md-editor 导出上没有 Markdown 组件");
    }
    return (markdown: string) => {
        try {
            return server.renderToStaticMarkup(
                createElement(Markdown, {
                    source: markdown,
                    disableCopy: true,
                    disallowedElements: MARKDOWN_DISALLOWED_ELEMENTS,
                    urlTransform: safeUrlTransform,
                    pluginsFilter: dropPrismHighlightPlugins,
                })
            );
        } catch (error) {
            throw new ArticleRenderError(`正文渲染失败：${error instanceof Error ? error.message : String(error)}`);
        }
    };
}

function loadRenderer(): Promise<MarkdownToHtml> {
    if (!rendererPromise) {
        rendererPromise = createRenderer().catch((error: unknown) => {
            // 加载失败（网络/chunk 缺失）不要把失败的 promise 永久缓存住，否则后续保存全部失败
            rendererPromise = null;
            throw error;
        });
    }
    return rendererPromise;
}

/**
 * 纯函数：`md → html`（异步只因为渲染器要按需动态加载）。
 * 同样的输入永远得到同样的输出；空 Markdown 直接返回空串，不加载渲染器。
 * 未整理前的原始输出见 createRenderer，整理规则见 normalizeRenderedHtml。
 *
 * 渲染分两步：
 * 1. `:::tabs` 需要**分段渲染**（每个标签页单独渲染成 HTML 再拼装）——把标签页 Markdown
 *    塞进 `<div>` 指望 rehype 在 HTML 块里继续解析，遇到围栏代码块会整段丢失；
 * 2. 其余内容：短代码 → Markdown 渲染 → 公式 → 清理。
 */
export async function renderMarkdownToHtml(markdown: string): Promise<string> {
    const md = markdown ?? "";
    if (!md.trim()) return "";
    const render = await loadRenderer();

    /**
     * 顺序很关键：**先**把嵌套在 tabs 里的块级短代码（`:::btns` / `:::gallery` / `:::hidden`）
     * 转成 HTML，**再**按 tabs 切分。
     *
     * 为什么：这些短代码自己也用 `:::` 收尾。如果先切 tabs，外层 `:::tabs … :::` 的惰性匹配会
     * 把内层那个 `:::` 当成自己的结束符 —— tabs 块在那里提前收尾，最后那页的按钮组/图集就变成
     * 未闭合的裸文本（实测：按钮组那一页显示 `<p>:::btns cols=3</p>` + 一串 `<li>`）。
     */
    const prepared = renderShortcodesToHtml(md);

    /** 一段 Markdown → HTML（块级短代码已在上面统一转换过，这里不再重复跑） */
    const renderSegment = (text: string): string => renderMathInHtml(normalizeRenderedHtml(render(text)));

    const parts = splitTabsBlocks(prepared);
    if (parts.length === 1 && parts[0].type === "md") return renderSegment(parts[0].text);

    let tabsIndex = 0;
    const html: string[] = [];
    for (const part of parts) {
        if (part.type === "md") {
            const seg = renderSegment(part.text);
            if (seg.trim()) html.push(seg);
            continue;
        }
        const sections = part.sections.map((s) => ({ title: s.title, html: renderSegment(s.body) }));
        if (sections.length === 0) continue;
        tabsIndex += 1;
        html.push(buildTabsHtml(part.head, sections, tabsIndex));
    }
    return html.join("\n");
}

/** resolveContentHtml 的返回：本次提交要带的 content_html，以及它是不是现渲染出来的 */
export interface ContentHtmlResolution {
    html: string;
    /** true = 本次现场渲染；false = 复用上次结果 / 沿用服务端回填 */
    rendered: boolean;
}

/**
 * 纯函数：决定**本次提交**要带的 `ContentHtml`。
 *
 * 三条规则（顺序即优先级）：
 * 1. md 非空且与上次渲染时一模一样 → 直接复用上次结果（满足「只在 content_md 变化时重渲染」）。
 *    复用不会丢 HTML：缓存里存的就一定非空（md 非空却渲染成空的情况会在调用方被拦下，不入缓存）。
 * 2. md 非空且变了 → 现渲染。
 * 3. md 为空 → **不回填空 HTML**，原样带回服务端回填的 `loadedHtml`。
 *    编辑一篇官方 Tiptap 后台写的旧文章时 content_md 本来就是空的（HTML 才是原文），
 *    这条规则保证点保存不会把它的正文清空。
 */
export async function resolveContentHtml(params: {
    contentMd: string;
    /** 详情接口回填的 content_html（新建时传空串） */
    loadedHtml: string;
    /** 上一次渲染用的 md（没渲染过传 null） */
    cachedMd: string | null;
    /** 上一次渲染的结果 */
    cachedHtml: string;
}): Promise<ContentHtmlResolution> {
    const { contentMd, loadedHtml, cachedMd, cachedHtml } = params;
    if (!contentMd.trim()) return { html: loadedHtml, rendered: false };
    if (cachedMd === contentMd && cachedHtml) return { html: cachedHtml, rendered: false };
    return { html: await renderMarkdownToHtml(contentMd), rendered: true };
}
