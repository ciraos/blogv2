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
 *   `:::gallery` `:::video-gallery`，以及渲染后的 `$…$` / `$$…$$` → `[data-latex]`
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
    | { type: "tabs"; head: string; sections: TabSection[] };

/** 把 `== 标题` 切成 [{title, body}]（围栏代码块里的 `== tab` 不算分段，但内容要保留） */
export function splitTabSections(body: string): Array<{ title: string; body: string }> {
    const lines = body.split(/\r?\n/);
    const sections: Array<{ title: string; body: string }> = [];
    let current: { title: string; body: string[] } | null = null;

    let fence: string | null = null;
    for (const line of lines) {
        const fenceMatch = /^ {0,3}(`{3,}|~{3,})/.exec(line);
        if (fenceMatch) {
            if (!fence) fence = fenceMatch[1];
            else if (fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length) fence = null;
            current?.body.push(line); // 围栏行本身也是代码块的一部分
            continue;
        }
        if (!fence) {
            const m = /^==\s*(.+?)\s*$/.exec(line);
            if (m) {
                if (current) sections.push({ title: current.title, body: current.body.join("\n") });
                // `== tab 标题` 里的 "tab" 只是语法关键字，官方渲染出来的按钮文字不含它
                current = { title: m[1].replace(/^tab\s+/i, ""), body: [] };
                continue;
            }
        }
        if (current) current.body.push(line);
    }
    if (current) sections.push({ title: current.title, body: current.body.join("\n") });
    return sections;
}

/** 从正文里切出「普通 Markdown」与「tabs 块」（代码区里的 tabs 语法不算） */
export function splitTabsBlocks(md: string): DocumentPart[] {
    const masked = maskCodeRegions(md);
    const re = /^:::\s*tabs\b([^\n]*)\n([\s\S]*?)\n:::\s*$/gm;
    const parts: DocumentPart[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(masked))) {
        const start = m.index;
        const original = md.slice(start, start + m[0].length);
        const [head, body] = originalGroups(original, m[0], [m[1], m[2]]);
        if (start > last) parts.push({ type: "md", text: md.slice(last, start) });
        parts.push({ type: "tabs", head, sections: splitTabSections(body) });
        last = start + m[0].length;
    }
    if (last < md.length) parts.push({ type: "md", text: md.slice(last) });
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
 * tabs 与公式不在这里：tabs 要分段渲染（见 splitTabsBlocks），公式在渲染成 HTML 之后处理。
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
    return /\{(?:btn|tip|linkcard|hide)\b/.test(markdown) || /^:::\s*(?:tabs|btns|hidden|gallery|video-gallery)\b/m.test(markdown);
}
