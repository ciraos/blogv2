import {
    colorClassSuffix,
    isPlaceholderExample,
    maskCodeRegions,
    parseParams,
} from "@/lib/article-shortcodes";

/**
 * 正文短代码 → HTML（**渲染**，不只是打补丁）。
 *
 * ── 为什么需要它 ────────────────────────────────────────────────────────────
 * 后端**不渲染文章正文**：保存时只对客户端提交的 `content_html` 做 `SanitizeHTML`。
 * 也就是说 `{btn}` / `{linkcard}` / `{tip}` / `:::tabs` 这些「主题短代码」必须由**编辑器**渲染成 HTML。
 * 官方后台用 Tiptap，天然会产出带 `btn-anzhiyu` / `anzhiyu-tag-link` / `anzhiyu-tip-wrapper` 的结构；
 * 我们的后台只有 Markdown 编辑器，保存时会用「纯 Markdown 渲染器」覆盖 `content_html`，
 * 于是短代码被当成普通文字写进库 —— 前台看到的就是「按钮变文字、链接卡变一行字、提示框没框」。
 * 本模块补上这一步：在 Markdown 渲染**之前**把短代码替换成官方同款 HTML，
 * 这样存进库的 `content_html` 与官方编辑器产物同构，前台 CSS / 增强脚本可直接生效。
 *
 * ── 覆盖范围 ────────────────────────────────────────────────────────────────
 *   `{linkcard …}` `{btn …}` `{tip …}` `:::tabs` `:::btns` `:::hidden` `{hide}`
 *   `:::gallery` `:::video-gallery` `:::chat`，以及渲染后的 `$…$` / `$$…$$` → `[data-latex]`
 *
 * 不处理的：`{kbd}` `{psw}` `{u}` `{emp}` `{wavy}` `{del}` `{sup}` `{sub}` —— 由前台
 * `article-body.tsx` 的 `enhanceInlineText()` 在运行时转换（原样留着才是正确行为）。
 *
 * ── 两个关键坑（都踩过，已修） ──────────────────────────────────────────────
 * ① **代码区不能渲染**：文档里常贴「短代码怎么写」的示例，都在围栏代码块里。
 *    统一用 `maskCodeRegions` 掩码后定位，再按偏移取原文（见 `originalGroups`）。
 *    不能对原文重跑正则：原文里代码块中的 `:::` 可见，正则会在那里提前收尾、整块被截断。
 * ② **tabs 必须分段渲染**：每个标签页内容单独渲染成 HTML 再拼装。把 Markdown 塞进
 *    `<div class="tab-item-content">` 指望 rehype 在 HTML 块里继续解析，遇到围栏代码块会整段丢失。
 */

const BTN_KEYS = ["url", "text", "icon", "color", "style", "layout", "position", "size"] as const;
const TIP_KEYS = ["text", "content", "theme", "position", "trigger", "delay"] as const;
const LINKCARD_KEYS = ["url", "title", "sitename", "icon", "tips"] as const;
const HIDDEN_KEYS = ["display", "bg", "color"] as const;

const TIP_THEMES = new Set(["dark", "light", "success", "info", "warning", "danger"]);
const TIP_POSITIONS = new Set(["top", "bottom", "left", "right"]);

/** 属性值转义（用于双引号包裹的属性） */
function esc(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

/** 文本内容转义 */
function escText(value: string): string {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * 把块级 HTML 前后补空行。
 *
 * Markdown 只有在「HTML 块」上下文里才会原样输出 —— `<div>` 紧跟文字会被塞进 `<p>`
 * （`<p>…<div>…</div></p>` 既非法又让相邻选择器失配）。官方产出的链接卡/按钮组/tabs 都是独立块。
 */
function asBlock(html: string): string {
    return `\n\n${html}\n\n`;
}

/** 图标：既可能是图标类名（anzhiyu-icon-book / ri:github-fill），也可能是一个图片 URL */
function iconHtml(icon: string | undefined, fallbackClass: string): string {
    if (icon && /^https?:\/\//i.test(icon)) {
        return `<img src="${esc(icon)}" alt="" loading="lazy" />`;
    }
    // Iconify 写法 prefix:name → 走 iconify svg 接口（与官方前端一致）
    if (icon && /^[a-z0-9-]+:[a-z0-9-]+$/i.test(icon)) {
        const [prefix, name] = icon.split(":");
        return `<img src="https://api.iconify.design/${esc(prefix)}/${esc(name)}.svg?color=currentColor" alt="" loading="lazy" />`;
    }
    const cls = icon ? (icon.startsWith("anzhiyu-icon-") ? icon : `anzhiyu-icon-${icon}`) : fallbackClass;
    return `<i class="anzhiyufont ${esc(cls)}"></i>`;
}

/**
 * 把「掩码串里的捕获组」映射回**原文**。
 *
 * 掩码与原文**等长**，所以按偏移量切原文即可。
 * 不能对原文重跑正则：掩码串里代码区是空格、原文里是真实内容，重跑会得到不同的匹配范围
 * （代码块里的 `:::` 会让正则提前收尾 → 整块被截断）。
 */
function originalGroups(original: string, maskedMatch: string, groups: Array<string | undefined>): string[] {
    let cursor = 0;
    return groups.map((g) => {
        if (g === undefined) return "";
        const at = maskedMatch.indexOf(g, cursor);
        if (at < 0) return g;
        cursor = at + g.length;
        return original.slice(at, at + g.length);
    });
}

/** 只在**代码区之外**做替换（所有块级短代码都必须用它） */
function replaceOutsideCode(md: string, re: RegExp, fn: (...groups: string[]) => string): string {
    const masked = maskCodeRegions(md);
    const scanner = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
    let out = "";
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = scanner.exec(masked))) {
        const original = md.slice(m.index, m.index + m[0].length);
        const groups = originalGroups(original, m[0], m.slice(1));
        out += md.slice(last, m.index) + fn(...groups);
        last = m.index + m[0].length;
    }
    return last === 0 ? md : out + md.slice(last);
}

/* ============================ 块级短代码 ============================ */

/**
 * `:::btns cols=3 style=card` + 若干 `- icon=… title=… url=… desc=… color=…` 行 + `:::` → 按钮组。
 * 结构对齐官方：`div.btns-container.btns-cols-N.btns-style-X > a.btn-item > .btn-icon + .btn-content`
 */
function renderBtnGroups(md: string): string {
    const blockRe = /^:::\s*btns\b([^\n]*)\n([\s\S]*?)\n\s*:::\s*$/gm;
    return replaceOutsideCode(md, blockRe, (head: string, body: string) => {
        const hp = parseParams(head ?? "", ["cols", "style"] as const);
        const cols = /^[1-6]$/.test(hp.cols ?? "") ? (hp.cols as string) : "3";
        const style = hp.style && /^(default|card|simple)$/.test(hp.style) ? hp.style : "default";

        const items = body
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter((line) => line.startsWith("- "))
            .map((line) => parseParams(line.slice(2), ["icon", "title", "url", "desc", "color"] as const));
        if (items.length === 0) return `\n\n:::btns${head ?? ""}\n${body}\n:::\n\n`;

        const hasDesc = items.some((it) => it.desc);
        const anchors = items
            .map((it) => {
                const cls = ["btn-item"];
                if (it.color && /^[a-z]+$/i.test(it.color)) cls.push(`btn-color-${it.color.toLowerCase()}`);
                if (it.desc) cls.push("has-desc");
                const href = it.url ? ` href="${esc(it.url)}"` : "";
                const content =
                    `<div class="btn-content"><div class="btn-title">${escText(it.title || it.url || "")}</div>` +
                    (it.desc ? `<div class="btn-desc">${escText(it.desc)}</div>` : "") +
                    `</div>`;
                return `<a class="${cls.join(" ")}"${href} target="_blank" rel="noopener noreferrer nofollow"><div class="btn-icon">${iconHtml(it.icon, "anzhiyu-icon-link")}</div>${content}</a>`;
            })
            .join("");

        return asBlock(
            `<div class="btns-container btns-cols-${cols} btns-style-${style}${hasDesc ? " btns-has-desc" : ""}">${anchors}</div>`
        );
    });
}

/**
 * `:::gallery cols=3 gap=10px ratio=1:1` + 若干 `![alt](url "标题")` + `:::` → 图片组。
 * ratio 保持 `w/h` 形式（与官方一致：`--gallery-ratio: 1/1`，不用百分比）。
 */
function renderGallery(md: string): string {
    const blockRe = /^:::\s*gallery\b([^\n]*)\n([\s\S]*?)\n:::\s*$/gm;
    return replaceOutsideCode(md, blockRe, (head: string, body: string) => {
        const hp = parseParams(head ?? "", ["cols", "gap", "ratio"] as const);
        const cols = /^[1-6]$/.test(hp.cols ?? "") ? (hp.cols as string) : "3";
        const gap = hp.gap ? hp.gap : "10px";
        const ratio = (hp.ratio ?? "").replace(/\s/g, "");
        const ratioSlash = ratio ? ratio.replace(":", "/") : "";

        const styleBits = [`--gallery-gap: ${gap}`];
        if (ratioSlash) styleBits.push(`--gallery-ratio: ${ratioSlash}`);

        const items = body
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => {
                const m = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/.exec(line);
                if (!m) return null;
                const [, alt, src, title] = m;
                if (!src) return null;
                const ratioAttr = ratioSlash ? ` data-ratio="${ratioSlash}"` : "";
                const titleAttr = title ? ` title="${esc(title)}"` : "";
                return (
                    `<div class="gallery-item"${ratioAttr}><img src="${esc(src)}" alt="${escText(alt || "")}"${titleAttr}>` +
                    (title ? `<div class="gallery-caption"><div class="gallery-title">${escText(title)}</div></div>` : "") +
                    `</div>`
                );
            })
            .filter(Boolean)
            .join("");

        if (!items) return `\n\n:::gallery${head ?? ""}\n${body}\n:::\n\n`;
        return asBlock(
            `<div class="gallery-container gallery-cols-${cols}" style="${styleBits.join("; ")}">${items}</div>`
        );
    });
}

/**
 * `:::video-gallery cols=2 gap=16px ratio=16:9` + 若干 `url=… title=…` + `:::` → 视频画廊。
 * ratio 用 w:h 表示，渲染成高度百分比（16:9 → 56.25%），与官方一致。
 */
function renderVideoGallery(md: string): string {
    const blockRe = /^:::\s*video-gallery\b([^\n]*)\n([\s\S]*?)\n:::\s*$/gm;
    return replaceOutsideCode(md, blockRe, (head: string, body: string) => {
        const hp = parseParams(head ?? "", ["cols", "gap", "ratio"] as const);
        const cols = /^[1-6]$/.test(hp.cols ?? "") ? (hp.cols as string) : "2";
        const gap = hp.gap ? hp.gap : "16px";

        const ratioStr = (hp.ratio ?? "").replace(/\s/g, "") || "16:9";
        const ratioPct = (() => {
            const m = /^(\d+):(\d+)$/.exec(ratioStr);
            if (!m) return "56.25%";
            const w = Number(m[1]);
            const h = Number(m[2]);
            if (!w || !h) return "56.25%";
            return `${Math.round((h / w) * 10000) / 100}%`;
        })();

        const items = body
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter((line) => line.startsWith("url="))
            .map((line) => {
                const p = parseParams(line, ["url", "title"] as const);
                if (!p.url) return null;
                const title = p.title || "";
                return (
                    `<div class="video-gallery-item"><div class="video-gallery-video-wrapper">` +
                    `<video class="video-gallery-video" src="${esc(p.url)}" controls preload="metadata" playsinline type="video/mp4"></video>` +
                    `<div class="video-gallery-play-overlay"><svg class="play-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"></path></svg></div>` +
                    `</div>` +
                    (title ? `<div class="video-gallery-caption"><div class="video-gallery-title">${escText(title)}</div></div>` : "") +
                    `</div>`
                );
            })
            .filter(Boolean)
            .join("");

        if (!items) return `\n\n:::video-gallery${head ?? ""}\n${body}\n:::\n\n`;
        return asBlock(
            `<div class="video-gallery-container video-gallery-cols-${cols}" style="--video-gallery-gap: ${gap}; --video-gallery-ratio: ${ratioPct};">${items}</div>`
        );
    });
}

/**
 * `:::hidden display=查看答案 bg=#FF7242 color=#fff` … `:::` → 块级隐藏块。
 * 结构：`div.hide-block > .hide-button + .hide-content`（前台 enhanceHidden 认这三个类）。
 * 用 `<div class="hide-button">` 而不是 `<button>`：button 在渲染器禁用标签表里会被剥掉。
 */
function renderHidden(md: string): string {
    const blockRe = /^:::\s*hidden\b([^\n]*)\n([\s\S]*?)\n:::\s*$/gm;
    return replaceOutsideCode(md, blockRe, (head: string, body: string) => {
        const params = parseParams(head ?? "", HIDDEN_KEYS);
        const display = params.display || "查看答案";
        const style = [params.bg && `background-color:${params.bg}`, params.color && `color:${params.color}`]
            .filter(Boolean)
            .join(";");
        const attr = style ? ` style="${esc(style)}"` : "";
        return (
            `\n\n<div class="hide-block"><div class="hide-button"${attr} role="button" tabindex="0">${escText(display)}</div>` +
            `<div class="hide-content">\n\n${body.trim()}\n\n</div></div>\n\n`
        );
    });
}

/** `{hide display=… bg=… color=…}内容{/hide}` → 行内隐藏块（`.hide-inline`） */
function renderHideInline(md: string): string {
    const re = /\{hide\b([^}]*)\}([\s\S]*?)\{\/hide\}/g;
    return replaceOutsideCode(md, re, (head: string, inner: string) => {
        const params = parseParams(head ?? "", HIDDEN_KEYS);
        const display = params.display || "查看答案";
        const style = [params.bg && `background-color:${params.bg}`, params.color && `color:${params.color}`]
            .filter(Boolean)
            .join(";");
        const attr = style ? ` style="${esc(style)}"` : "";
        return (
            `<span class="hide-inline"><span class="hide-button"${attr} role="button" tabindex="0">${escText(display)}</span>` +
            `<span class="hide-content" style="display:none">${inner.trim()}</span></span>`
        );
    });
}

/** `{linkcard …}{/linkcard}` → 官方同款链接卡 */
function renderLinkcards(md: string): string {
    const re = /\{linkcard\b([^}]*)\}(?:\s*\{\/linkcard\})?/g;
    return replaceOutsideCode(md, re, (head: string) => {
        const params = parseParams(head ?? "", LINKCARD_KEYS);
        if (!params.url) return `{linkcard${head ?? ""}}`;
        const tips = params.tips || "引用站外地址";
        const title = params.title || params.url;
        const sitename = params.sitename || "";
        return asBlock(
            `<div class="anzhiyu-tag-link"><a class="tag-Link" target="_blank" href="${esc(params.url)}" rel="external nofollow noreferrer noopener">` +
                `<div class="tag-link-tips">${escText(tips)}</div>` +
                `<div class="tag-link-bottom">` +
                `<div class="tag-link-left">${iconHtml(params.icon, "anzhiyu-icon-link")}</div>` +
                `<div class="tag-link-right">` +
                `<div class="tag-link-title">${escText(title)}</div>` +
                (sitename ? `<div class="tag-link-sitename">${escText(sitename)}</div>` : "") +
                `</div></div></a></div>`
        );
    });
}

/** `{btn …}{/btn}` → `a.btn-anzhiyu`（含颜色/描边/尺寸类与块级容器） */
function renderButtons(md: string): string {
    const re = /\{btn\b([^}]*)\}(?:\s*\{\/btn\})?/g;
    return replaceOutsideCode(md, re, (head: string) => {
        const params = parseParams(head ?? "", BTN_KEYS);
        if (isPlaceholderExample(params)) return `{btn${head ?? ""}}`;
        if (!params.url && !params.text) return `{btn${head ?? ""}}`;

        const classes = ["btn-anzhiyu"];
        if (params.style === "outline") classes.push("btn-outline");
        if (params.size === "larger") classes.push("btn-larger");
        if (params.color) {
            const suffix = colorClassSuffix(params.color);
            if (suffix) classes.push(`btn-${suffix}`);
        }

        const inner = `${iconHtml(params.icon, "anzhiyu-icon-circle-arrow-right")}<span>${escText(params.text || params.url || "")}</span>`;
        const anchor = params.url
            ? `<a class="${classes.join(" ")}" href="${esc(params.url)}" title="${esc(params.text || "")}" target="_blank" rel="external nofollow noreferrer noopener">${inner}</a>`
            : `<span class="${classes.join(" ")}" title="${esc(params.text || "")}">${inner}</span>`;

        const isBlock = params.layout === "block";
        const position = params.position === "center" || params.position === "right" ? params.position : "";
        return isBlock
            ? asBlock(`<div class="btn-container${position ? ` btn-container-${position}` : ""}">${anchor}</div>`)
            : anchor;
    });
}

/** `{tip …}{/tip}` → 官方同款 `span.anzhiyu-tip-wrapper`（前台 enhanceTips 负责 hover/click） */
function renderTips(md: string): string {
    const re = /\{tip\b([^}]*)\}([\s\S]*?)\{\/tip\}/g;
    return replaceOutsideCode(md, re, (head: string, inner: string) => {
        const params = parseParams(head ?? "", TIP_KEYS);
        const text = (params.text || inner || "").trim();
        const content = (params.content || text).trim();
        if (!text) return `{tip${head ?? ""}}${inner}{/tip}`;
        const theme = params.theme && TIP_THEMES.has(params.theme) ? params.theme : "dark";
        const position = params.position && TIP_POSITIONS.has(params.position) ? params.position : "top";
        const trigger = params.trigger === "click" ? "click" : "hover";
        const delay = /^\d+$/.test(params.delay ?? "") ? params.delay : "";

        return (
            `<span class="anzhiyu-tip-wrapper" style="position:relative;display:inline-block;cursor:pointer;"` +
            (trigger === "click" ? ` data-trigger="click"` : "") +
            (delay ? ` data-delay="${delay}"` : "") +
            `>` +
            /**
             * 这里**不写** `border-bottom`：下划线由 globals.css 的
             * `.article-body .anzhiyu-tip-text { text-decoration: underline; text-decoration-style: dotted }` 负责。
             * 两边都写就会叠出两条线（实测：虚点下划线 + 虚线下边框 = 两条）。
             */
            `<span class="anzhiyu-tip-text">${escText(text)}</span>` +
            `<span class="anzhiyu-tip tip-${theme} tip-${position}" data-content="${esc(content)}" data-position="${position}" data-theme="${theme}" data-trigger="${trigger}"${delay ? ` data-delay="${delay}"` : ""} role="tooltip" aria-hidden="true">${escText(content)}</span>` +
            `</span>`
        );
    });
}

/* ============================ tabs（分段渲染） ============================ */

export interface TabSection {
    title: string;
    /** 该标签页的 Markdown 原文（未渲染） */
    body: string;
}

export type DocumentPart =
    | { type: "md"; text: string }
    | { type: "tabs"; head: string; sections: TabSection[] }
    | { type: "steps"; head: string; sections: TabSection[] }
    | { type: "chat"; head: string; entries: ChatEntry[] }
    /** 正文要递归渲染的面板块（verdict / quote-card / note） */
    | { type: "panel"; name: PanelName; head: string; body: string }
    /** 已经拼好的白板块（chapters / compare / timeline / rating）：不走 Markdown 渲染器 */
    | { type: "html"; html: string };

/** 把 `== 标题` 切成 [{title, body}]（围栏代码块里的 `== tab` 不算分段，但内容要保留） */
export function splitTabSections(body: string): Array<{ title: string; body: string }> {
    const lines = body.split(/\r?\n/);
    const sections: Array<{ title: string; body: string }> = [];
    let current: { title: string; body: string[] } | null = null;

    let fence: string | null = null;
    /**
     * 嵌套块深度：`== 标题` 只在**第 0 层**才算分段。
     *
     * 反例（实测 2026-11-18，线上 DPsG）：文章里写
     *   :::tabs
     *   ==tab 预览
     *   :::steps
     *   == 装 ffmpeg        ← 这是 steps 的步骤标题
     *   :::
     *   :::
     * 不做深度判断时，steps 里的 `== 装 ffmpeg` 会被当成 tabs 的新分栏，
     * 于是出现「装 ffmpeg」「抽音轨」「跑识别」三个假标签页，而 steps 根本没渲染。
     * 嵌套块本身在两边的 `::: ` 之间，整段留给 renderBlocks 递归处理。
     */
    let depth = 0;

    for (const line of lines) {
        const fenceMatch = /^ {0,3}(`{3,}|~{3,})/.exec(line);
        if (fenceMatch) {
            if (!fence) fence = fenceMatch[1];
            else if (fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length) fence = null;
            current?.body.push(line); // 围栏行本身也是代码块的一部分
            continue;
        }
        if (!fence) {
            if (BLOCK_CLOSE.test(line)) {
                depth = Math.max(0, depth - 1);
                if (current) current.body.push(line);
                continue;
            }
            if (BLOCK_OPEN.test(line)) {
                depth += 1;
                if (current) current.body.push(line);
                continue;
            }
            if (depth === 0) {
                const m = /^==\s*(.+?)\s*$/.exec(line);
                if (m) {
                    if (current) sections.push({ title: current.title, body: current.body.join("\n") });
                    // `== tab 标题` 里的 "tab" 只是语法关键字，官方渲染出来的按钮文字不含它
                    current = { title: m[1].replace(/^tab\s+/i, ""), body: [] };
                    continue;
                }
            }
        }
        if (current) current.body.push(line);
    }
    if (current) sections.push({ title: current.title, body: current.body.join("\n") });
    return sections;
}

/** 块级 `:::` 语法：开块行 `:::名字 参数…`，闭块行是单独一行 `:::` */
const BLOCK_OPEN = /^:::[ \t]*([A-Za-z][A-Za-z0-9_-]*)(.*)$/;
const BLOCK_CLOSE = /^:::[ \t]*$/;

/** 正文要递归渲染的面板块 */
export type PanelName = "verdict" | "quote-card" | "note";

/** 已经拼好的白板块：它们的内容只是文本行，不需要再过一遍 Markdown */
const WHITE_BLOCKS = new Set(["chapters", "compare", "timeline", "rating"]);

/** 块名 → 处理方式；认不出的名字（other）只参与配对，收尾时原样交回正文 */
type BlockKind = "tabs" | "steps" | "chat" | "panel" | "html" | "other";

function blockKind(name: string): BlockKind {
    if (name === "tabs" || name === "steps" || name === "chat") return name;
    if (name === "verdict" || name === "quote-card" || name === "note") return "panel";
    if (WHITE_BLOCKS.has(name)) return "html";
    return "other";
}

/**
 * 从正文里切出「普通 Markdown」与「分段渲染的块」（tabs / chat），并且**认得嵌套**。
 *
 * ── 为什么不能用正则 ──────────────────────────────────────────────────────
 * `:::tabs … :::` 与 `:::chat … :::` 的结束符是同一个裸 `:::`（和 `:::btns` 等一样），
 * 正则的惰性匹配会把**内层**的 `:::` 当成外层的结束符。实测（2026-11-18）：
 *   - 「tabs 里放 chat」→ tabs 被撕成裸文本 `<p>:::tabs … </p>`，chat 掉到块外，尾部留一个 `<p>:::</p>`；
 *   - 「chat 里放 tabs」→ chat 在内层 `:::` 处提前收尾，tabs 语法变成气泡里的文字，后半段漏到正文。
 * 所以这里按行做**栈式配对**：开块压栈、裸 `:::` 弹栈，只有弹回第 0 层才算真正结束。
 * 嵌套块整段原样留给上层正文，由渲染器递归再切一次（见 article-markdown 的 renderBlocks）。
 *
 * 代码围栏 / 行内代码里的 `:::` 一律不算语法：判定永远在 maskCodeRegions 的结果上做。
 */
export function splitSegmentedBlocks(md: string): DocumentPart[] {
    const lines = md.split("\n");
    const maskedLines = maskCodeRegions(md).split("\n");
    const parts: DocumentPart[] = [];
    /** 普通 Markdown 的行缓冲（遇到块就 flush 成一段） */
    let buffer: string[] = [];
    /** 正在收集的块；kind 决定收尾时怎么处理，name 是原始块名（还原时要用） */
    const stack: Array<{ kind: BlockKind; name: string; head: string; lines: string[] }> = [];

    const flushBuffer = () => {
        const text = buffer.join("\n");
        if (text.trim()) parts.push({ type: "md", text });
        buffer = [];
    };
    /** 把一个块还原成 `:::名字 …` … `:::` 的原文（用于交回上层 / 兜底） */
    const reopen = (frame: { name: string; head: string; lines: string[] }, closed = true) => [
        `:::${frame.name}${frame.head}`,
        ...frame.lines,
        ...(closed ? [":::"] : []),
    ];

    /** 一个顶层块收尾：能成块就成块，认不出或内容为空就原样退回正文（绝不吞内容） */
    const emitFrame = (frame: { kind: BlockKind; name: string; head: string; lines: string[] }) => {
        const body = frame.lines.join("\n");
        const fallback = () => buffer.push(...reopen(frame));

        if (frame.kind === "tabs" || frame.kind === "steps") {
            const sections = splitTabSections(body);
            if (sections.length === 0) return fallback();
            parts.push({ type: frame.kind, head: frame.head, sections });
            return;
        }
        if (frame.kind === "chat") {
            const entries = parseChatBody(body);
            if (entries.length === 0) return fallback();
            parts.push({ type: "chat", head: frame.head, entries });
            return;
        }
        if (frame.kind === "panel") {
            if (!body.trim()) return fallback();
            parts.push({ type: "panel", name: frame.name as PanelName, head: frame.head, body });
            return;
        }
        if (frame.kind === "html") {
            const html = buildWhiteBlock(frame.name, frame.head, body);
            if (!html) return fallback();
            parts.push({ type: "html", html });
            return;
        }
        fallback();
    };

    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        const maskedLine = maskedLines[i] ?? "";

        // ── 块外：普通文本 / 开块 ──
        if (stack.length === 0) {
            const open = BLOCK_CLOSE.test(maskedLine) ? null : BLOCK_OPEN.exec(maskedLine);
            if (!open) {
                buffer.push(line);
                continue;
            }
            flushBuffer();
            const name = open[1].toLowerCase();
            stack.push({ kind: blockKind(name), name, head: open[2] ?? "", lines: [] });
            continue;
        }

        // ── 块内：闭块 / 嵌套开块 / 正文 ──
        if (BLOCK_CLOSE.test(maskedLine)) {
            const frame = stack.pop() as { kind: BlockKind; name: string; head: string; lines: string[] };
            if (stack.length > 0) {
                // 嵌套块：整段原文交回上层，递归渲染时再切
                stack[stack.length - 1].lines.push(...reopen(frame));
                continue;
            }
            emitFrame(frame);
            continue;
        }

        const open = BLOCK_OPEN.exec(maskedLine);
        if (open) {
            const name = open[1].toLowerCase();
            stack.push({ kind: blockKind(name), name, head: open[2] ?? "", lines: [] });
            continue;
        }
        stack[stack.length - 1].lines.push(line);
    }

    // 收尾：没闭合的块原样当文本（少一个 `:::`），绝不丢内容
    while (stack.length > 0) {
        const frame = stack.pop() as { kind: BlockKind; name: string; head: string; lines: string[] };
        const text = reopen(frame, false);
        if (stack.length > 0) stack[stack.length - 1].lines.push(...text);
        else buffer.push(...text);
    }
    flushBuffer();

    return parts;
}

/** 用**已渲染好的**标签页 HTML 拼装 .tabs 结构 */
export function buildTabsHtml(
    head: string,
    sections: Array<{ title: string; html: string }>,
    index: number
): string {
    if (sections.length === 0) return "";
    const id = `tabs-${index}`;
    const activeRaw = /active\s*=\s*(\d+)/i.exec(head ?? "")?.[1];
    const active = activeRaw ? Math.max(1, Number(activeRaw)) : 1;
    const nav = sections
        .map((s, i) => `<div class="tab${i === active - 1 ? " active" : ""}" data-index="${i}">${escText(s.title)}</div>`)
        .join("");
    const contents = sections
        .map(
            (s, i) =>
                `<div class="tab-item-content${i === active - 1 ? " active" : ""}" id="${id}-${i + 1}">${s.html}</div>`
        )
        .join("");
    return `<div class="tabs" id="${id}"><ul class="nav-tabs">${nav}</ul><div class="tab-contents">${contents}</div></div>`;
}

/* ============================ 白板块与面板（chapters / compare / timeline / rating / steps / panel） ============================ */

/**
 * ⚠️ 这一节的 HTML 在**保存时会被后端消毒**（pkg/service/parser/service.go:76 起的 bluemonday 策略），
 * 存进库的 content_html 与这里产出的不完全一样。实测能活下来的与会被剥掉的：
 *
 *   保留：div / span / button / img / p / 标题 / li / ul / table 上的 class；div 上的 style（CSS 变量也在）；
 *        img 的 src / alt / title；button 的 type / aria-label；div 与 span 的 role；
 *        `<source src type>`（audio 的 src 只对 video / source 放行，`<audio src>` 会被剥掉！）
 *   剥掉：ol 与 figure 上的 class（这两个元素没进 class 白名单）、所有未登记的 data-*、
 *        input 上的 min / max / value（range 靠默认值 0 / 100 / 50 正好可用）
 *
 * 所以这里的产出必须只用「能活下来」的写法：列表一律 div + class，定位/时长信息放 class 或
 * 文本内容（由 article-body 的增强脚本读），音频一律 `<audio><source src></audio>`。
 * 想加新块时照着这一条走，否则保存后样式/交互全失效（踩过：compare 的 class 被剥成裸 figure）。
 */

/**
 * 一组「行项目」：只认 `- ` 开头的行，`- 主语 :: 附注` 用 ` :: ` 分隔。
 * 这些块的内容只当纯文本（不做 Markdown），所以按行解析最省事、也最不容易被正文里的符号带跑。
 */
function listItems(body: string): Array<{ lead: string; note: string }> {
    return body
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.startsWith("- "))
        .map((line) => {
            const raw = line.slice(2).trim();
            const [lead, ...rest] = raw.split(/\s+::\s+/);
            return { lead: lead.trim(), note: rest.join(" :: ").trim() };
        })
        .filter((item) => item.lead.length > 0);
}

/** `03:12` / `01:03:12` → 秒；解析不出返回 null */
function timeToSeconds(value: string): number | null {
    const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
    if (!m) return null;
    const minutes = Number(m[2]);
    return m[3] === undefined ? Number(m[1]) * 60 + minutes : Number(m[1]) * 3600 + minutes * 60 + Number(m[3]);
}

/** 只放行 http(s)、站内绝对路径与位图 data URI（其余当没写） */
function safeMediaUrl(url?: string): string {
    const value = (url ?? "").trim();
    return /^(?:https?:\/\/|\/(?!\/)|data:image\/(?:png|jpe?g|gif|webp|avif)[;,])/i.test(value) ? value : "";
}

/**
 * `:::chapters` —— 播客章节条：时间戳 + 标题，点一条把播放器跳到那个时间点。
 *
 * ```
 * :::chapters title="本期章节" src=/audio/ep12.mp3
 * - 00:00 开场：为什么聊剪辑
 * - 03:12 降噪到底该给多少 :: 这条每次都有人问
 * :::
 * ```
 *
 * 给了 `src`（或 `audio=`）才出播放条，否则只是一张章节清单（点不动的 div）。
 * 播放/拖动/跳转都由 article-body 的 enhanceChapters 接管（原生 `<audio>`，不引第三方播放器）。
 *
 * 消毒注意：`<audio src>` 会被后端剥掉，必须写成 `<audio><source src></audio>`；
 * 跳转用的秒数不能放 data-*，由脚本从 `.chapters-stamp` 的文本（`mm:ss`）里现算。
 */
const CHAPTER_KEYS = ["title", "src", "audio"] as const;

/** 音频 mime：`<source>` 的 type 只是给浏览器一个提示，猜不准就让浏览器自己嗅探 */
function audioMime(url: string): string {
    const ext = /\.([a-z0-9]+)(?:[?#]|$)/i.exec(url)?.[1]?.toLowerCase() ?? "";
    if (ext === "wav") return "audio/wav";
    if (ext === "ogg" || ext === "oga") return "audio/ogg";
    if (ext === "m4a" || ext === "mp4" || ext === "aac") return "audio/mp4";
    if (ext === "flac") return "audio/flac";
    return "audio/mpeg";
}

function buildChaptersHtml(head: string, body: string): string {
    const params = parseParams(head, CHAPTER_KEYS);
    const audio = safeMediaUrl(params.src || params.audio);
    const items = listItems(body)
        .map((item) => {
            const m = /^(\d{1,2}:\d{2}(?::\d{2})?)\s+(.+)$/.exec(item.lead);
            if (!m) return null;
            if (timeToSeconds(m[1]) === null) return null;
            return { stamp: m[1], title: m[2].trim(), note: item.note };
        })
        .filter((item): item is { stamp: string; title: string; note: string } => item !== null);
    if (items.length === 0) return "";

    const title = params.title ? `<div class="chapters-title">${escText(params.title)}</div>` : "";
    const player = audio
        ? `<div class="chapters-player">` +
          // 图标由 CSS 画（::before 三角 / 双竖条）：文字符号会被系统渲染成彩色 emoji，跟版面不搭
          `<button class="chapters-toggle" type="button" aria-label="播放"></button>` +
          `<span class="chapters-clock chapters-clock-current">00:00</span>` +
          `<span class="chapters-track" role="progressbar"><span class="chapters-track-fill"></span></span>` +
          `<span class="chapters-clock chapters-clock-total">--:--</span>` +
          `<audio preload="metadata"><source src="${esc(audio)}" type="${audioMime(audio)}"></audio>` +
          `</div>`
        : "";

    const rows = items
        .map((item) => {
            const inner =
                `<span class="chapters-stamp">${escText(item.stamp)}</span>` +
                `<span class="chapters-label">${escText(item.title)}` +
                (item.note ? `<span class="chapters-note">${escText(item.note)}</span>` : "") +
                `</span>`;
            return audio
                ? `<button class="chapters-item" type="button">${inner}</button>`
                : `<div class="chapters-item">${inner}</div>`;
        })
        .join("");

    return `<div class="chapters">${title}${player}<div class="chapters-list">${rows}</div></div>`;
}

/**
 * `:::compare` —— 前后对比滑块（降噪前后、调色前后、旧版/新版）。
 *
 * ```
 * :::compare before=/img/noisy.jpg after=/img/clean.jpg label=降噪前后 ratio=16:9
 * :::
 * ```
 *
 * 两张图叠在一起，上层用 `clip-path` 按 `--compare-pos` 裁切，中间一根把手；
 * 拖动由一条透明的 `<input type=range>` 驱动（键盘左右键也能用），见 enhanceCompare。
 * 块内容不参与渲染（写什么都忽略）。
 *
 * 消毒注意：`<figure>` 不在 class 白名单里（会被剥成裸 figure），容器必须是 `<div>`；
 * range 的 min/max/value 也会被剥掉，但默认值正好是 0/100/50，够用。
 */
const COMPARE_KEYS = ["before", "after", "label", "ratio", "before-label", "after-label"] as const;

function buildCompareHtml(head: string): string {
    const params = parseParams(head, COMPARE_KEYS);
    const before = safeMediaUrl(params.before);
    const after = safeMediaUrl(params.after);
    if (!before || !after) return "";
    const ratio = /^\d{1,2}:\d{1,2}$/.test(params.ratio ?? "") ? (params.ratio as string).replace(":", "/") : "16/9";
    const label = params.label || "前后对比";
    const beforeLabel = params["before-label"] || "前";
    const afterLabel = params["after-label"] || "后";
    return (
        `<div class="compare" role="group" style="--compare-ratio: ${ratio}; --compare-pos: 50%">` +
        `<img class="compare-base" src="${esc(before)}" alt="${esc(`${label} · ${beforeLabel}`)}" loading="lazy" decoding="async">` +
        `<span class="compare-layer"><img src="${esc(after)}" alt="${esc(`${label} · ${afterLabel}`)}" loading="lazy" decoding="async"></span>` +
        `<span class="compare-tag compare-tag-before">${escText(beforeLabel)}</span>` +
        `<span class="compare-tag compare-tag-after">${escText(afterLabel)}</span>` +
        `<span class="compare-handle"></span>` +
        `<input class="compare-range" type="range">` +
        `</div>`
    );
}

/**
 * `:::timeline` —— 时间轴（复盘、历程、更新日志）。
 *
 * ```
 * :::timeline title="这一年"
 * - 2026-03 第 1 期上线 :: 两个人一台笔记本
 * - 2026-08 破 100 期 :: 开始接嘉宾
 * :::
 * ```
 */
const TIMELINE_KEYS = ["title"] as const;

function buildTimelineHtml(head: string, body: string): string {
    const items = listItems(body).map((item) => {
        // 第一个空白之前算「日期」，其余算标题（没日期就整行当标题）
        const m = /^(\S+)\s+([\s\S]+)$/.exec(item.lead);
        return { date: m ? m[1] : "", title: m ? m[2].trim() : item.lead, note: item.note };
    });
    if (items.length === 0) return "";
    const params = parseParams(head, TIMELINE_KEYS);
    const title = params.title ? `<div class="timeline-title">${escText(params.title)}</div>` : "";
    const rows = items
        .map(
            (item) =>
                `<div class="timeline-item">` +
                `<div class="timeline-marker"></div>` +
                `<div class="timeline-body">` +
                (item.date ? `<time class="timeline-date">${escText(item.date)}</time>` : "") +
                `<div class="timeline-heading">${escText(item.title)}</div>` +
                (item.note ? `<div class="timeline-note">${escText(item.note)}</div>` : "") +
                `</div></div>`
        )
        .join("");
    return `<div class="timeline">${title}<div class="timeline-list">${rows}</div></div>`;
}

/**
 * `:::rating` —— 评分卡（装备 / 软件评测）。
 *
 * ```
 * :::rating title=剪映专业版 score=4.5
 * - 上手速度 :: 5
 * - 降噪效果 :: 3.5
 * - 价格 :: 4
 * :::
 * ```
 *
 * `score` 不写就用各维度的平均值；`max` 默认 5（也可以写 10 或 100）。
 */
const RATING_KEYS = ["title", "score", "max"] as const;

function buildRatingHtml(head: string, body: string): string {
    const params = parseParams(head, RATING_KEYS);
    const max = Number(params.max) > 0 ? Number(params.max) : 5;
    const rows = listItems(body)
        .map((item) => {
            const value = Number(item.note);
            if (!Number.isFinite(value)) return null;
            const score = Math.max(0, Math.min(max, value));
            return { dim: item.lead, score, pct: (score / max) * 100 };
        })
        .filter((row): row is { dim: string; score: number; pct: number } => row !== null);
    if (rows.length === 0) return "";

    const declared = Number(params.score);
    const total = Number.isFinite(declared)
        ? Math.max(0, Math.min(max, declared))
        : rows.reduce((sum, row) => sum + row.score, 0) / rows.length;
    const fmt = (value: number) => String(Math.round(value * 10) / 10);

    const title = params.title ? `<span class="rating-title">${escText(params.title)}</span>` : "";
    const list = rows
        .map(
            (row) =>
                `<li class="rating-row"><span class="rating-dim">${escText(row.dim)}</span>` +
                `<span class="rating-bar"><i style="width: ${Math.round(row.pct)}%"></i></span>` +
                `<span class="rating-value">${escText(fmt(row.score))}</span></li>`
        )
        .join("");
    return (
        `<div class="rating"><div class="rating-head">${title}` +
        `<span class="rating-score"><b>${escText(fmt(total))}</b><i>/${escText(fmt(max))}</i></span>` +
        `</div><ul class="rating-rows">${list}</ul></div>`
    );
}

/** 白板块入口：按块名分发（认不出返回空串 → 调用方把原文退回正文） */
function buildWhiteBlock(name: string, head: string, body: string): string {
    if (name === "chapters") return buildChaptersHtml(head, body);
    if (name === "compare") return buildCompareHtml(head);
    if (name === "timeline") return buildTimelineHtml(head, body);
    if (name === "rating") return buildRatingHtml(head, body);
    return "";
}

/**
 * `:::steps` —— 步骤条（教程）。每一步用 `== 标题` 分段，内容照常写 Markdown（代码块也行）。
 *
 * ```
 * :::steps title="十分钟上字幕"
 * == 装 ffmpeg
 * ```bash
 * apt install ffmpeg
 * ```
 * == 抽音轨
 * 一条命令搞定。
 * :::
 * ```
 */
export function buildStepsHtml(head: string, sections: Array<{ title: string; html: string }>): string {
    if (sections.length === 0) return "";
    const params = parseParams(head, ["title"] as const);
    const title = params.title ? `<div class="steps-title">${escText(params.title)}</div>` : "";
    const rows = sections
        .map(
            (section, index) =>
                `<div class="steps-item"><span class="steps-index">${index + 1}</span>` +
                `<div class="steps-body"><div class="steps-heading">${escText(section.title)}</div>` +
                `<div class="steps-content">${section.html}</div></div></div>`
        )
        .join("");
    return `<div class="steps">${title}<div class="steps-list">${rows}</div></div>`;
}

/**
 * 面板块（正文要递归渲染成 HTML 的三位）：
 *   - `:::verdict` 编辑结论：标题 + 结论正文 + 署名
 *   - `:::quote-card` 引文卡：大字引文 + 出处/署名
 *   - `:::note` 小注：比 tip 安静的旁注
 *
 * ```
 * :::verdict title=编辑结论 author=米葱苓
 * 这期最值得听的是 **03:12** 那段。
 * :::
 * ```
 */
const PANEL_KEYS = ["title", "author", "source"] as const;

const PANEL_LABELS: Record<PanelName, string> = {
    verdict: "编辑结论",
    "quote-card": "引文",
    note: "小注",
};

export function buildPanelHtml(name: PanelName, head: string, bodyHtml: string): string {
    const params = parseParams(head, PANEL_KEYS);
    const label = params.title || PANEL_LABELS[name];
    const source = name === "quote-card" && params.source ? `<div class="panel-source">${escText(params.source)}</div>` : "";
    const byline = params.author ? `<div class="panel-byline">—— ${escText(params.author)}</div>` : "";
    return (
        `<div class="article-panel article-panel-${name}">` +
        `<div class="panel-label">${escText(label)}</div>` +
        `<div class="panel-body">${bodyHtml}</div>` +
        `${source}${byline}</div>`
    );
}

/* ============================ chat（分段渲染） ============================ */

/**
 * `:::chat` —— 模仿 QQ/微信的聊天框（播客对谈、采访稿、群聊梗）。
 *
 * ```
 * :::chat title="第 12 期 · 播客幕后" other=阿柚 me=我 avatar=/img/ayu.png theme=qq
 * 阿柚: 这一期我们聊聊「播客是怎么剪出来的」。
 * :: 以上是第 12 期的开场白
 * 我: 好，先从**波形**说起？
 * :::
 * ```
 *
 * 为什么和 tabs 一样按「分段渲染」处理：每条消息都要完整跑一遍 Markdown
 * （引用 / 列表 / 行内代码 / 围栏代码块都算），把 Markdown 塞进 `<div>` 里
 * rehype 就不会继续解析了 —— tabs 当初就是栽在这一条上。
 *
 * 消息里的行规则见 parseChatBody；拼装见 buildChatHtml。
 */

/** 头部参数（key 全部小写，与 parseParams 的小写化一致） */
const CHAT_KEYS = ["title", "me", "other", "avatar", "my-avatar", "theme"] as const;

/** 配色预设：默认 ink 跟随主题主色，qq/wechat 用各自的经典色 */
const CHAT_THEMES = new Set(["qq", "wechat", "ink"]);

/** 头像只认 http(s) 与站内绝对路径（`javascript:` / `data:` 一律忽略 → 退回首字色块） */
const CHAT_AVATAR_URL = /^(?:https?:\/\/|\/(?!\/))/i;

/** 说话人行：`名字: 内容`（半角/全角冒号都认；名字 1~12 字、不含空白与冒号） */
const CHAT_NAME_LINE = /^([^\s:：]{1,12})[:：]/;

/** 系统条行：`:: 文字`（`:::` 是块结束符，这里要求 `::` 后面有空白，不会撞上） */
const CHAT_SYSTEM_LINE = /^::[ \t]+/;

export type ChatEntry =
    | { type: "msg"; name: string; body: string }
    | { type: "system"; text: string };

/** 已渲染好的一条消息（消息体已经是 HTML，拼装时不再碰 Markdown） */
export type ChatRenderedEntry =
    | { type: "msg"; name: string; html: string }
    | { type: "system"; text: string };

/** `other=阿柚,小北` → ["阿柚", "小北"]（逗号、顿号、竖线分隔都认） */
function splitNames(value: string | undefined): string[] {
    return (value ?? "")
        .split(/[,，、|]/)
        .map((name) => name.trim())
        .filter(Boolean);
}

/**
 * 把 `:::chat` 的正文切成「气泡 / 系统条」序列。行规则按优先级：
 *
 * 1. 以空白开头（缩进）→ **续行**，原样并入上一条消息。
 *    想写「注意：…」这种开头又不想被当成人名，就缩进一格。
 * 2. `:: 文字` → 居中系统条（时间、章节分隔、旁白）。
 * 3. `名字: 台词` → 新气泡（名字 1~12 字）。
 * 4. 其它（含空行）→ 续行，所以一条消息里可以有多个段落。
 *
 * 判定一律在 `maskCodeRegions` 的结果上做：围栏代码块里的 `名字:` / `::` 不算语法；
 * 但内容永远取**原文**（掩码把代码区压成空格了，取掩码会丢代码）。
 */
export function parseChatBody(body: string): ChatEntry[] {
    const lines = body.split(/\r?\n/);
    const masked = maskCodeRegions(body).split(/\r?\n/);
    /** 草稿：消息体先按行攒着，最后统一 join（`名字:` 之前的裸文本也能成为一条无名消息） */
    type Draft = { type: "msg"; name: string; lines: string[] } | { type: "system"; text: string };
    const drafts: Draft[] = [];
    /** 正在追加的那条消息：所有续行都进这里（跨过系统条也照样并回上一条）。
     *  放进对象里而不是用一个 `let`：赋值只发生在 start() 闭包里，TS 的控制流分析
     *  看不到闭包内的赋值，会把 `let` 收窄成 `null` → `if (current)` 变成 `never` 报错。 */
    const state: { current: { type: "msg"; name: string; lines: string[] } | null } = { current: null };

    const start = (name: string, first: string) => {
        state.current = { type: "msg", name, lines: [first] };
        drafts.push(state.current);
    };

    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        const maskedLine = masked[i] ?? "";
        // 缩进 = 续行（也顺带避开「结论：…」这类被误判成人名的开头）
        const indented = /^[ \t]/.test(line);

        if (!indented && CHAT_SYSTEM_LINE.test(maskedLine)) {
            drafts.push({ type: "system", text: line.replace(/^::[ \t]*/, "").trim() });
            continue;
        }

        const hit = indented ? null : CHAT_NAME_LINE.exec(maskedLine);
        if (hit) {
            // 掩码与原文等长：名字占 hit[1].length 个字符，紧跟的分隔冒号也占 1 个（全角冒号同样是 1 个）
            start(hit[1], line.slice(hit[1].length + 1).replace(/^[ \t]+/, ""));
            continue;
        }

        if (state.current) state.current.lines.push(line);
        else if (line.trim()) start("", line);
    }

    return drafts
        .map((draft): ChatEntry =>
            draft.type === "system"
                ? draft
                : { type: "msg", name: draft.name, body: draft.lines.join("\n").replace(/^\n+|\n+$/g, "") }
        )
        // 只剩空白的消息（块里孤立的一行换行）直接丢掉
        .filter((entry) => entry.type === "system" || entry.body.trim().length > 0);
}

/**
 * 头像：给了合法的 `avatar` 就用图，否则画一个「首字色块」占位，并把**名字**放进
 * `.chat-avatar-name`（CSS 隐藏）—— 文章页 / 编辑器预览渲染前会按这个名字在站点头像服务上
 * 生成一张头像替换掉整个占位块（见 article-shortcodes.ts 的 patchChatAvatars）。
 *
 * 为什么名字要单独放一个 span：后端消毒会把未登记的 `data-*` 全剥掉（data-chat-name 存不进去），
 * 而 `span` 上的 `class` 是放行的，所以只能靠「类名 + 文本内容」传递信息。
 */
function chatAvatar(name: string, url: string | undefined, side: "left" | "right"): string {
    if (url && CHAT_AVATAR_URL.test(url)) {
        return `<div class="chat-avatar"><img src="${esc(url)}" alt="" loading="lazy" decoding="async" /></div>`;
    }
    const trimmed = name.trim();
    const char = Array.from(trimmed)[0] ?? (side === "right" ? "我" : "言");
    return (
        `<div class="chat-avatar chat-avatar-text chat-avatar-site">` +
        `<span class="chat-avatar-name">${escText(trimmed || char)}</span>` +
        `<span class="chat-avatar-char" aria-hidden="true">${escText(char)}</span>` +
        `</div>`
    );
}

/**
 * 用**已渲染好的**消息 HTML 拼装 `.chat-thread`（对齐 QQ：头像在外侧、名字在气泡上方、右侧气泡换色）。
 * 名字在 `me`（默认「我」）里 → 右侧；其余一律左侧。
 */
export function buildChatHtml(head: string, entries: ChatRenderedEntry[]): string {
    if (entries.length === 0) return "";
    const params = parseParams(head ?? "", CHAT_KEYS);
    const theme = params.theme && CHAT_THEMES.has(params.theme) ? params.theme : "ink";
    const meNames = new Set(splitNames(params.me || "我"));
    const otherNames = new Set(splitNames(params.other));
    // 声明了 other 时头像只配给这些名字（群聊里其他人走首字色块）；没声明就配给所有左侧气泡
    const otherAvatar = (name: string) =>
        otherNames.size === 0 || otherNames.has(name.trim()) ? params.avatar : undefined;

    const rows = entries
        .map((entry) => {
            if (entry.type === "system") {
                return `<div class="chat-system"><span>${escText(entry.text)}</span></div>`;
            }
            const name = entry.name.trim();
            const side: "left" | "right" = meNames.has(name) ? "right" : "left";
            const nameHtml = name ? `<div class="chat-name">${escText(name)}</div>` : "";
            return (
                `<div class="chat-msg chat-${side}">` +
                chatAvatar(name, side === "right" ? params["my-avatar"] : otherAvatar(name), side) +
                `<div class="chat-main">${nameHtml}<div class="chat-bubble">${entry.html}</div></div>` +
                `</div>`
            );
        })
        .join("");

    const title = params.title ? `<div class="chat-title">${escText(params.title)}</div>` : "";
    return asBlock(`<div class="chat-thread chat-theme-${theme}">${title}<div class="chat-msgs">${rows}</div></div>`);
}

/* ============================ 公式（渲染后处理） ============================ */

/**
 * 在**渲染后的 HTML** 上把 `$…$` / `$$…$$` 换成 anheyu 的公式占位结构。
 *
 * 为什么在渲染后：渲染前要先判断「这段是不是在代码块里」，只能自己扫围栏；一旦围栏没配对
 * 就整段误判成代码，公式一处都转不了。渲染后代码块已是真实的 `<pre>`/`<code>`，跳过它们即可。
 */
export function renderMathInHtml(html: string): string {
    if (!html || !html.includes("$")) return html;

    const stash: string[] = [];
    const masked = html.replace(/<(pre|code)\b[^>]*>[\s\S]*?<\/\1>/gi, (all) => {
        stash.push(all);
        return `\u0000MATH${stash.length - 1}\u0000`;
    });

    const withMath = masked.replace(/\$\$([\s\S]+?)\$\$|\$(?!\$)([^\n$<>]+?)\$(?!\$)/g, (all, block, inline) => {
        const isBlock = block !== undefined;
        const latex = String(isBlock ? block : inline).trim();
        if (!latex) return all;
        // 明显不是公式的（没有 LaTeX 特征）原样保留，避免把「价格 $5 和 $6」也转成公式
        const looksLatex = /[\\^_{}=+\-*/]/.test(latex) || /^[A-Za-z0-9()\s,.]{1,40}$/.test(latex);
        if (!looksLatex) return all;
        return isBlock
            ? `<div class="math-block" data-type="math-block" data-latex="${esc(latex)}"></div>`
            : `<span class="math-inline" data-type="math-inline" data-latex="${esc(latex)}"></span>`;
    });

    const restored = withMath.replace(/\u0000MATH(\d+)\u0000/g, (_all, i) => stash[Number(i)] ?? "");
    // 块级公式被 Markdown 包进 <p> 时把 <p> 拆掉（<p> 里放 <div> 是非法嵌套）
    return restored.replace(/<p>\s*(<div class="math-block"[\s\S]*?<\/div>)\s*<\/p>/g, "$1");
}

/* ============================ 入口 ============================ */

/**
 * 纯函数：把正文 Markdown 里的**块级**短代码替换成 HTML（其余内容原样保留）。
 * tabs / chat 与公式不在这里：前者要分段渲染（见 splitSegmentedBlocks，且允许互相嵌套），
 * 公式在渲染成 HTML 之后处理。
 */
export function renderShortcodesToHtml(markdown: string): string {
    if (!markdown) return markdown;
    let out = renderBtnGroups(markdown);
    out = renderGallery(out);
    out = renderVideoGallery(out);
    out = renderHideInline(out);
    out = renderHidden(out);
    out = renderLinkcards(out);
    out = renderButtons(out);
    out = renderTips(out);
    return out;
}

/** 正文里是否还有「未渲染的短代码」（用于决定要不要提示/回退） */
export function hasUnrenderedShortcodes(markdown: string): boolean {
    return (
        /\{(?:btn|tip|linkcard|hide)\b/.test(markdown) ||
        /^:::\s*(?:tabs|steps|btns|hidden|gallery|video-gallery|chat|chapters|compare|timeline|rating|verdict|quote-card|note)\b/m.test(
            markdown
        )
    );
}
