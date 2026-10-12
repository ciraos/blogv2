"use client";

import { useEffect, useMemo, useRef } from "react";

import katex from "katex";

import { enhanceBlock, type CodeBlockOptions } from "@/lib/code-block";
import { renderCopyCopyrightText, type ArticleCopyCopyrightConfig } from "@/lib/post-copyright";

/** 标题锚点：给 h1-h4 生成 id 并注入 GitHub 风格的 # 链接 */
function slugify(text: string): string {
    return text
        .trim()
        .toLowerCase()
        .replace(/[^\w\u4e00-\u9fff-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function enhanceHeadings(root: HTMLElement) {
    const used = new Set<string>();
    root.querySelectorAll<HTMLElement>("h1, h2, h3, h4").forEach((heading) => {
        if (heading.closest("pre")) return;

        const id = heading.id || slugify(heading.textContent ?? "") || "section";
        let unique = id;
        let n = 2;
        while (used.has(unique)) {
            unique = `${id}-${n++}`;
        }
        used.add(unique);
        heading.id = unique;

        if (!heading.querySelector(".heading-anchor")) {
            const anchor = document.createElement("a");
            anchor.className = "heading-anchor";
            anchor.href = `#${unique}`;
            anchor.setAttribute("aria-hidden", "true");
            anchor.textContent = "#";
            heading.prepend(anchor);
        }
    });
}

// ===================== 公式 katex 前端渲染 =====================

/**
 * ciraos 后端只输出 `<span data-latex="..." data-type="math-inline" class="math-inline">裸 latex 文本</span>`，
 * 没有 katex HTML；这里用 katex 前端渲染。若后端已输出完整 katex HTML 则跳过。
 */
function enhanceKatex(root: HTMLElement) {
    root.querySelectorAll<HTMLElement>("[data-latex]").forEach((el) => {
        const latex = el.getAttribute("data-latex");
        if (!latex) return;
        if (el.querySelector(".katex")) return; // 后端已渲染过
        const displayMode =
            el.getAttribute("data-type") === "math-block" ||
            el.classList.contains("math-block");
        try {
            katex.render(latex, el, {
                displayMode,
                throwOnError: false,
                strict: false,
            });
        } catch {
            // 渲染失败保留原文本
        }
    });
}

// ===================== 插件增强（移植自 anheyu-app-frontend） =====================

/** 行内文本插件解析：后端未转换的 {u}{/u} {emp}{/emp} {wavy}{/wavy} {del}{/del} {kbd}{/kbd} {psw}{/psw} 转成 HTML 元素 */
function enhanceInlineText(root: HTMLElement) {
    const tagMap: Record<string, string> = {
        u: "inline-underline",
        emp: "inline-emphasis-mark",
        wavy: "inline-wavy",
        del: "inline-delete",
        kbd: "inline-kbd",
        psw: "inline-password",
    };

    root.querySelectorAll<HTMLElement>("p, li, h1, h2, h3, h4, h5, h6, blockquote, td, th, figcaption, span").forEach((el) => {
        // 跳过代码块和已有插件容器
        if (el.closest("pre") || el.closest(".md-editor-code") || el.closest(".anzhiyu-tip") || el.closest(".tabs")) return;
        if (!el.textContent?.includes("{")) return;

        for (const [tag, cls] of Object.entries(tagMap)) {
            const re = new RegExp(`\\{${tag}\\}([\\s\\S]*?)\\{/${tag}\\}`, "g");
            if (!re.test(el.innerHTML)) continue;
            el.innerHTML = el.innerHTML.replace(
                re,
                (_m, inner: string) => {
                    if (tag === "psw") {
                        return `<span class="${cls}">${inner}</span>`;
                    }
                    return `<span class="${cls}">${inner}</span>`;
                }
            );
        }
    });
}

/** 折叠框裸文本解析：后端未渲染的 `::: folding [open] [#色值] 标题 内容 :::` 转成 details.folding-tag */
function enhanceFolding(root: HTMLElement) {
    root.querySelectorAll<HTMLElement>("p, li, div").forEach((el) => {
        // 只处理包含折叠框语法的元素
        const text = el.textContent ?? "";
        if (!text.includes("::: folding")) return;
        // 跳过代码块 / 已渲染的折叠框
        if (el.closest("pre") || el.closest(".md-editor-code") || el.closest("details")) return;

        // 匹配：::: folding [open] [#hex] 标题 ... 内容 ... :::（标题/内容可换行或同行）
        const re = /::: folding\s*(open)?\s*(#[0-9a-fA-F]{3,8})?\s*([\s\S]*?)\s*:::/;

        // 遍历文本节点，找到含折叠框语法的节点替换（保留事件绑定，不用 innerHTML 序列化）
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        const textNodes: Text[] = [];
        let node: Node | null;
        while ((node = walker.nextNode())) {
            textNodes.push(node as Text);
        }

        for (const textNode of textNodes) {
            const nodeText = textNode.data ?? "";
            if (!nodeText.includes("::: folding")) continue;

            const m = nodeText.match(re);
            if (!m) continue;

            const isOpen = !!m[1];
            const color = m[2] || "";
            const bodyText = m[3] || "";

            // 标题/内容拆分：
            // - 换行格式（::: folding\n标题\n内容\n:::）：第一行标题，其余内容
            // - 单行格式（::: folding 标题 内容 :::）：标题取第一段（到首个空格），其余为内容
            const lines = bodyText.split("\n").map((l) => l.trim()).filter(Boolean);
            if (lines.length === 0) continue;
            let title: string;
            let content: string;
            if (lines.length > 1) {
                title = lines[0];
                content = lines.slice(1).join("\n");
            } else {
                const firstSpace = lines[0].indexOf(" ");
                if (firstSpace > 0) {
                    title = lines[0].slice(0, firstSpace).trim();
                    content = lines[0].slice(firstSpace).trim();
                } else {
                    title = lines[0];
                    content = "";
                }
            }

            const details = document.createElement("details");
            details.className = "folding-tag" + (color ? " custom-color" : "");
            if (isOpen) details.setAttribute("open", "");

            const summary = document.createElement("summary");
            summary.textContent = title;

            // 自定义颜色折叠框：边框 + summary 背景随展开/收起联动
            // - 默认折叠：点击展开 → 长条背景 + 边框变自定义色；收起后恢复默认
            // - 默认打开：长条背景 + 边框一直是自定义色；收起后恢复默认
            if (color) {
                const applyColor = () => {
                    details.style.borderColor = color;
                    summary.style.backgroundColor = color;
                    summary.style.color = "#fff";
                };
                const resetColor = () => {
                    details.style.borderColor = "";
                    summary.style.backgroundColor = "";
                    summary.style.color = "";
                };

                if (isOpen) applyColor();

                details.addEventListener("toggle", () => {
                    if (details.open) {
                        applyColor();
                    } else {
                        resetColor();
                    }
                });
            }

            const contentDiv = document.createElement("div");
            contentDiv.className = "content";
            contentDiv.innerHTML = content.replace(/\n/g, "<br>");

            details.appendChild(summary);
            details.appendChild(contentDiv);

            // 用 details 替换折叠语法文本节点（保留其他文本，事件绑定随元素保留）
            const before = nodeText.slice(0, m.index ?? 0);
            const after = nodeText.slice((m.index ?? 0) + m[0].length);
            const frag = document.createDocumentFragment();
            if (before) frag.appendChild(document.createTextNode(before));
            frag.appendChild(details);
            if (after) frag.appendChild(document.createTextNode(after));
            textNode.replaceWith(frag);
        }
    });
}

/** 提示块裸文本解析：后端未渲染的 `!!! type\n内容\n!!!` 转成 div.admonition */
function enhanceAdmonition(root: HTMLElement) {
    root.querySelectorAll<HTMLElement>("p, div").forEach((el) => {
        const text = el.textContent ?? "";
        if (!text.includes("!!!")) return;
        if (el.closest("pre") || el.closest(".md-editor-code") || el.closest(".admonition") || el.closest("details")) return;

        // 匹配：!!! type\n内容\n!!!（可同行：!!! type 内容 !!!）
        const re = /!!!\s*(\w+)\s*\n?([\s\S]*?)\n?\s*!!!/;
        const m = el.innerHTML.match(re);
        if (!m) return;

        const type = m[1].toLowerCase();
        const bodyText = m[2].trim();

        const div = document.createElement("div");
        div.className = `admonition ${type}`;

        const title = document.createElement("div");
        title.className = "admonition-title";
        title.textContent = type;

        const body = document.createElement("div");
        body.className = "admonition-body";
        body.innerHTML = bodyText.replace(/\n/g, "<br>");

        div.appendChild(title);
        div.appendChild(body);

        // 用 DOM 节点替换，保留前后文本
        const before = el.innerHTML.slice(0, m.index ?? 0);
        const after = el.innerHTML.slice((m.index ?? 0) + m[0].length);
        const frag = document.createDocumentFragment();
        if (before) frag.appendChild(document.createTextNode(before));
        frag.appendChild(div);
        if (after) frag.appendChild(document.createTextNode(after));
        // 替换 el 自身：若 el 只剩提示块则整体替换，否则重建
        if (el.innerHTML.trim() === m[0]) {
            el.replaceWith(frag);
        } else {
            el.innerHTML = "";
            el.appendChild(frag);
        }
    });
}

/** 外链加 target=_blank */
function enhanceExternalLinks(root: HTMLElement) {
    root.querySelectorAll<HTMLAnchorElement>('a[href^="http"]').forEach((link) => {
        if (!link.getAttribute("target")) {
            link.setAttribute("target", "_blank");
            link.setAttribute("rel", "noopener noreferrer nofollow");
        }
    });
}

/** Tabs 标签页切换 */
function enhanceTabs(root: HTMLElement) {
    root.querySelectorAll<HTMLElement>(".tabs").forEach((container) => {
        const tabs = container.querySelectorAll<HTMLElement>(".nav-tabs .tab");
        const contents = container.querySelectorAll<HTMLElement>(".tab-contents .tab-item-content");

        tabs.forEach((tab, index) => {
            tab.addEventListener("click", () => {
                tabs.forEach((t) => t.classList.remove("active"));
                contents.forEach((c) => c.classList.remove("active"));
                tab.classList.add("active");
                if (contents[index]) contents[index].classList.add("active");
            });
        });

        // 确保导航和内容的 active 状态同步
        const activeBtn = container.querySelector<HTMLElement>(".nav-tabs .tab.active");
        if (tabs.length > 0) {
            if (!activeBtn) tabs[0].classList.add("active");
            const activeIdx = activeBtn ? Array.from(tabs).indexOf(activeBtn) : 0;
            if (!container.querySelector(".tab-item-content.active") && contents[activeIdx]) {
                contents[activeIdx].classList.add("active");
            }
        }
    });
}

/**
 * Tip 提示（hover / click）。
 *
 * 分工（**两档必须彻底分层**，用户实测反馈过「click 档悬停也会弹出来」）：
 * - **hover 档（默认）**：显示完全交给 CSS，选择器把 click 档排除在外
 *   （globals.css：`.anzhiyu-tip-wrapper:not([data-trigger="click"]):hover .anzhiyu-tip`）——
 *   没有 JS（禁用脚本、组件尚未 hydrate）也能看到提示；显示延迟用 CSS `transition-delay`
 *   （`--anzhiyu-tip-delay`，这里按 `data-delay` 写到 wrapper 上），不需要计时器。
 * - **click 档**：由这里实现（官方 PostContent/index.tsx:162-189 的做法：点文字切换、点外部关闭；
 *   我们额外做了 Esc 关闭与 aria 状态）。这一档在 CSS 层就不命中任何 `:hover` 规则，
 *   只有 `data-visible="true"` 能显示它——所以「点开后再悬停/移开鼠标」都不会改变状态。
 *
 * 属性读法：「wrapper 优先、内容 span 兜底」——官方把 data-trigger 写在 wrapper 上
 * （callout-block.tsx:277）却从内容 span 上读（PostContent/index.tsx:142-144），后端也只写 wrapper，
 * 两边都认才不会出现「写了、JS 读不到」。补丁（src/lib/article-shortcodes.ts:patchArticleTips）
 * 只往 **wrapper** 上写 data-trigger / data-delay：CSS 的 hover 排除规则只认 wrapper 上的属性。
 * 注意 delay 的两档语义：**写了**（0 也算写）= 用作者给的延迟，**没写** = 用 CSS 的 300ms 默认档。
 *
 * 注意：这里只用 class / data-* 控制显示（不写 inline style）——inline style 会盖掉 CSS 的
 * hover 规则与 `transition-delay`，是「hover 与 click 两套机制打架」的根源。
 */
function enhanceTips(root: HTMLElement, cleanupFns: (() => void)[]) {
    root.querySelectorAll<HTMLElement>(".anzhiyu-tip-wrapper").forEach((wrapper) => {
        const tip = wrapper.querySelector<HTMLElement>(".anzhiyu-tip");
        if (!tip) return;

        // data-* 优先取 wrapper（官方/后端的写法），取不到再退回内容 span（官方前台的读法）
        const attr = (name: string) => wrapper.getAttribute(name) ?? tip.getAttribute(name);
        const trigger = attr("data-trigger") === "click" ? "click" : "hover";

        // delay 的语义必须区分「写了」与「没写」，两者不是一回事：
        //   写了（含 `data-delay="0"`）= 作者明确要求这个延迟，0 就是「立即显示」；
        //   没写 = 交给 CSS 里的 300ms 默认档。
        // 所以只在**属性存在**时写自定义属性。早先的 `parsedDelay > 0` 把 0 和「没写」一起当成默认档，
        // 于是补丁在 wrapper 上写的 `data-delay="0"`（{tip delay=0}）被这里静默丢掉、退回 300ms
        // ——同一份参数「写的这端写了、读的这端不认」，是补丁与消费方不一致的典型。
        const rawDelay = attr("data-delay");
        if (rawDelay !== null) {
            const parsedDelay = Number.parseInt(rawDelay, 10);
            // 只接受 0..60000 的整数：后端/正文里写出 NaN 会让 setTimeout(NaN) 立即触发（静默改行为）
            if (Number.isFinite(parsedDelay) && parsedDelay >= 0 && parsedDelay <= 60000) {
                wrapper.style.setProperty("--anzhiyu-tip-delay", `${parsedDelay}ms`);
            }
        }

        /** 切换展开态：只写 class / data-* / aria，不写 inline style（理由见函数头注释） */
        const setVisible = (visible: boolean) => {
            tip.classList.toggle("show", visible);
            tip.setAttribute("data-visible", visible ? "true" : "false");
            wrapper.setAttribute("aria-expanded", visible ? "true" : "false");
        };

        // 可访问性：wrapper 是可切换的控件（后端只输出 span，这里补上 role / tabindex / 状态）。
        // role 放 wrapper 而不是 text span：点击监听就在 wrapper 上，焦点与控件必须是同一个元素。
        wrapper.setAttribute("role", "button");
        wrapper.setAttribute("tabindex", "0");
        setVisible(false);

        // hover 档到此为止：显示/隐藏/延迟全部由 CSS 负责，这里不挂任何事件
        if (trigger !== "click") return;

        const handleToggle = (e: Event) => {
            // 不 preventDefault：wrapper 里是可复制的提示文字，拦掉默认行为会连选中都做不了
            // 阻止冒泡，避免这次点击立刻被下面的「点外部关闭」判成外部点击而马上关掉
            e.stopPropagation();
            setVisible(tip.getAttribute("data-visible") !== "true");
        };

        const handleDocumentClick = (e: Event) => {
            const target = e.target;
            if (target instanceof Node && !wrapper.contains(target)) setVisible(false);
        };

        const handleKeydown = (e: KeyboardEvent) => {
            if (e.key === "Enter" || e.key === " ") {
                // 空格键在页面上会滚动，键盘切换必须拦掉默认行为
                e.preventDefault();
                setVisible(tip.getAttribute("data-visible") !== "true");
            } else if (e.key === "Escape") {
                setVisible(false);
            }
        };

        // 官方把点击挂在 tip-text 上，这里挂在 wrapper 上：内容 span 显示时也在 wrapper 内，
        // 点提示框本身不再需要额外处理（官方还多点一下 toggle，等于关掉刚打开的提示）
        wrapper.addEventListener("click", handleToggle);
        wrapper.addEventListener("keydown", handleKeydown);
        document.addEventListener("click", handleDocumentClick);
        cleanupFns.push(() => {
            wrapper.removeEventListener("click", handleToggle);
            wrapper.removeEventListener("keydown", handleKeydown);
            document.removeEventListener("click", handleDocumentClick);
        });
    });
}

/** 隐藏块 hidden */
function enhanceHidden(root: HTMLElement) {
    const hideContents = root.querySelectorAll<HTMLElement>(".hide-content");
    hideContents.forEach((content) => {
        content.style.display = "none";
    });

    root.querySelectorAll<HTMLElement>(".hide-button").forEach((button) => {
        if (!button.getAttribute("data-display")) {
            button.setAttribute("data-display", button.textContent || "查看");
        }
        button.addEventListener("click", () => {
            const parent = button.closest<HTMLElement>(".hide-block, .hide-inline");
            if (!parent) return;
            const content = parent.querySelector<HTMLElement>(".hide-content");
            if (!content) return;
            if (content.style.display === "none" || !content.style.display) {
                content.style.display = parent.classList.contains("hide-inline") ? "inline" : "block";
                button.textContent = "收起";
            } else {
                content.style.display = "none";
                button.textContent = button.getAttribute("data-display") || "查看";
            }
        });
    });
}

/** 行内密码 psw */
function enhancePasswords(root: HTMLElement) {
    root.querySelectorAll<HTMLElement>(".inline-password").forEach((pw) => {
        pw.addEventListener("click", () => {
            pw.classList.toggle("revealed");
        });
    });
}

/** LinkCard 链接卡片：iconify 图标转 img、补缺失节点 */
function enhanceLinkCards(root: HTMLElement) {
    const toIconifySvgUrl = (iconifyName: string): string => {
        const [prefix, name] = iconifyName.split(":");
        if (!prefix || !name) return "";
        return `https://api.iconify.design/${prefix}/${name}.svg?color=currentColor`;
    };

    root.querySelectorAll<HTMLElement>(".anzhiyu-tag-link .tag-Link").forEach((card) => {
        const bottom = card.querySelector<HTMLElement>(".tag-link-bottom");
        if (!bottom) return;
        const left = bottom.querySelector<HTMLElement>(".tag-link-left");

        if (left) {
            // iconify span → img
            left.querySelectorAll<HTMLElement>(".iconify[data-icon]").forEach((span) => {
                const iconName = (span.getAttribute("data-icon") || "").trim();
                const [prefix, name] = iconName.split(":");
                if (!prefix || !name) return;
                const img = document.createElement("img");
                img.src = toIconifySvgUrl(`${prefix}:${name}`);
                img.alt = "";
                img.loading = "eager";
                span.replaceWith(img);
            });
            // i.anzhiyufont 旧图标 → img
            left.querySelectorAll<HTMLElement>("i.anzhiyufont").forEach((node) => {
                const img = document.createElement("img");
                img.src = toIconifySvgUrl("rivet-icons:link");
                img.alt = "";
                img.loading = "eager";
                node.replaceWith(img);
            });
            // 无图标时补默认链接图标
            if (!left.querySelector("img, i")) {
                const img = document.createElement("img");
                img.src = toIconifySvgUrl("rivet-icons:link");
                img.alt = "";
                img.loading = "eager";
                left.appendChild(img);
            }
        }

        const right = bottom.querySelector<HTMLElement>(".tag-link-right");
        if (right) {
            const titleEl = right.querySelector<HTMLElement>(".tag-link-title");
            if (titleEl && !(titleEl.textContent || "").trim()) {
                titleEl.textContent = (card as HTMLAnchorElement).getAttribute("href") || "链接卡片";
            }
            let sitenameEl = right.querySelector<HTMLElement>(".tag-link-sitename");
            if (!sitenameEl) {
                sitenameEl = document.createElement("span");
                sitenameEl.className = "tag-link-sitename";
                right.appendChild(sitenameEl);
            }
            if (!(sitenameEl.textContent || "").trim()) {
                sitenameEl.textContent = "网站名称";
            }
        }

        const tipsEl = card.querySelector<HTMLElement>(".tag-link-tips");
        if (tipsEl && !(tipsEl.textContent || "").trim()) {
            tipsEl.textContent = "引用站外地址";
        }

        // 补箭头
        if (!bottom.querySelector(".tag-link-arrow-icon")) {
            const arrow = document.createElement("img");
            arrow.className = "tag-link-arrow-icon";
            arrow.src = toIconifySvgUrl("fa6-solid:angle-right");
            arrow.alt = "";
            arrow.loading = "eager";
            bottom.appendChild(arrow);
        }
    });

    // 图标不懒加载（data-src 直接替换）
    root.querySelectorAll<HTMLImageElement>(".anzhiyu-tag-link .tag-link-left img[data-src]").forEach((img) => {
        const dataSrc = img.getAttribute("data-src");
        if (dataSrc) {
            img.src = dataSrc;
            img.removeAttribute("data-src");
        }
    });

    // 自定义图标加载失败 → 显示占位图（如 iconify 无对应图标集时 404）
    const iconPlaceholder = "https://cdn.jsdmirror.com/gh/ciraos/ciraos-static@main/img/404_1.avif";
    root.querySelectorAll<HTMLImageElement>(".anzhiyu-tag-link .tag-link-left img").forEach((img) => {
        if (img.dataset.iconFallback) return;
        img.dataset.iconFallback = "1";
        img.addEventListener("error", () => {
            if (img.dataset.iconFallbackApplied) return;
            img.dataset.iconFallbackApplied = "1";
            img.src = iconPlaceholder;
            img.removeAttribute("data-src");
        });
        // 已缓存的失败图片可能不触发 error，检查自然宽度
        if (img.complete && img.naturalWidth === 0) {
            img.dataset.iconFallbackApplied = "1";
            img.src = iconPlaceholder;
        }
    });
}

/** mermaid 图表类型关键字（识别后端未渲染、被 markdown 解析成裸文本的图表源码） */
const MERMAID_KEYWORDS = [
    "flowchart", "graph", "sequenceDiagram", "classDiagram", "stateDiagram-v2", "stateDiagram",
    "erDiagram", "journey", "gantt", "pie", "mindmap", "timeline", "quadrantChart", "gitGraph",
    "C4Context", "C4Component", "C4Container", "C4Deployment", "C4Dynamic", "packet",
    "block-beta", "sankey-beta", "xychart-beta", "zenuml", "architecture-beta", "kanban",
    "radar", "sankey", "matrix", "dimension", "info",
];

/** 形如 `flowchart TD` 的图表类型关键字前缀 */
const MERMAID_KEYWORD_RE = new RegExp(`^(?:${MERMAID_KEYWORDS.join("|")})\\b`);

/** mermaid 连接符：flowchart 等单行书写时仍是合法语法 */
const MERMAID_CONNECTOR_RE = /-->|--x|->|==>|-.->|---|:::|~>/;

/** 行式语法类型：单行内容必须按语句关键字重新断行才能渲染（gitGraph / sequenceDiagram 等） */
const MERMAID_LINE_ORIENTED_RE = new RegExp(
    `^(?:gitGraph|sequenceDiagram|classDiagram|stateDiagram-v2|stateDiagram|erDiagram|journey|gantt|pie|mindmap|timeline|quadrantChart|block-beta|sankey-beta|xychart-beta|zenuml|architecture-beta|kanban|radar|sankey|matrix|dimension)\\b`
);

/** gitGraph 语句关键字（行式语法，单行时需断行） */
const MERMAID_GITGRAPH_RE = /^gitGraph\b/;

/**
 * 判断文本是否像 mermaid 源码：
 * - 多行（原先后端保留换行的情况）
 * - 单行但含连接符（flowchart 单行含连接符，可还原断行后渲染）
 * - 单行行式语法类型（gitGraph 等，需先还原断行）
 */
function looksLikeMermaidSource(text: string): boolean {
    if (!MERMAID_KEYWORD_RE.test(text)) return false;
    if (text.includes("\n")) return true;
    if (MERMAID_CONNECTOR_RE.test(text)) return true;
    return MERMAID_LINE_ORIENTED_RE.test(text);
}

/**
 * 单行 mermaid 源码断行还原：
 * markdown 会把段落内的单个换行压成空格，导致 flowchart / gitGraph 这类行式语法变成一行；
 * 按语法结构重新断行后即可正常渲染。
 */
function restoreMermaidLines(code: string): string {
    let c = code;
    // flowchart/graph：`flowchart TD Start --> Stop` → 方向声明与节点换行
    c = c.replace(/^(flowchart|graph)\s+[A-Z]{2}\s+/i, (m) => `${m.trimEnd()}\n`);
    // gitGraph 语句关键字断行（仅当确为 gitGraph 时，避免误伤 flowchart 节点名）
    if (MERMAID_GITGRAPH_RE.test(c)) {
        c = c.replace(/\b(commit|branch|checkout|merge|tag|cherry-pick|reset)\b/g, "\n$1");
    }
    // 行式语法类型关键字单独一行（放在 gitGraph 断行之后，避免 ^ 锚点失效）
    c = c.replace(MERMAID_LINE_ORIENTED_RE, "\n$&");
    c = c.replace(/\n{2,}/g, "\n");
    return c.trim();
}

/**
 * 统一处理为可渲染的 mermaid 源码：
 * - gitGraph：markdown 可能把语句压成单行（空格分隔）或拆成逐词换行，先合并为单行再按关键字断行
 * - 其余类型：无换行时按语法结构还原断行
 */
function prepareMermaidSource(raw: string): string {
    const code = raw.trim();
    if (MERMAID_GITGRAPH_RE.test(code)) {
        return restoreMermaidLines(code.replace(/\s+/g, " ").trim());
    }
    return code.includes("\n") ? code : restoreMermaidLines(code);
}

/** 去掉 mermaid 源码开头的 `--- title: ... ---` frontmatter（用于识别） */
function stripMermaidFrontmatter(text: string): string {
    return text.replace(/^---\r?\n[\s\S]*?\r?\n---\s*/, "");
}

/** 取元素文本，把 <br>（markdown 行尾两个空格的硬换行）还原成 \n */
function elementTextWithBreaks(el: HTMLElement): string {
    const clone = el.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
    return (clone.textContent ?? "").trim();
}

/** 提取被 markdown 解析过的 mermaid 裸文本（ciraos 后端不渲染 mermaid 时的兜底） */
function collectMermaidTextBlocks(root: HTMLElement): { element: HTMLElement; code: string }[] {
    const blocks: { element: HTMLElement; code: string }[] = [];
    const handledContainers = new Set<HTMLElement>();
    const replacedRegions = new Set<HTMLElement>();

    // 1) 带 frontmatter 的形式：<hr> + <h1~h4>title: X</h1~h4> + <p>diagram...</p>
    //    （markdown 把 ```mermaid 内的 --- 解析成 hr、`title: X` 解析成标题）
    root.querySelectorAll<HTMLElement>("div, section").forEach((el) => {
        if (el.closest("pre") || el.closest(".md-editor-code") || el.closest(".md-editor-mermaid") || el.closest("details")) return;
        const hr = el.querySelector<HTMLElement>(":scope > hr");
        const titleEl = el.querySelector<HTMLElement>(":scope > h1, :scope > h2, :scope > h3, :scope > h4");
        if (!hr || !titleEl) return;

        // 去掉我们自己加的 heading-anchor（#）再取标题
        const titleClone = titleEl.cloneNode(true) as HTMLElement;
        titleClone.querySelector(".heading-anchor")?.remove();
        const titleText = (titleClone.textContent ?? "").trim();
        const titleMatch = titleText.match(/^title:\s*(.+)$/i);
        if (!titleMatch) return;

        // 标题之后的所有兄弟节点文本拼成图表正文
        let rest = "";
        let node: Node | null = titleEl.nextSibling;
        while (node) {
            if (node.nodeType === Node.ELEMENT_NODE) {
                const part = elementTextWithBreaks(node as HTMLElement);
                if (part) rest += (rest ? "\n" : "") + part;
            }
            node = node.nextSibling;
        }
        if (!looksLikeMermaidSource(rest)) return;

        const body = prepareMermaidSource(rest);
        const code = `---\ntitle: ${titleMatch[1].trim()}\n---\n${body}`;

        // hr 是容器第一个子节点 → 整体替换容器；否则只包住 hr 起的区域，保留 hr 之前的内容
        if (hr === el.firstElementChild) {
            blocks.push({ element: el, code });
            handledContainers.add(el);
        } else {
            const holder = document.createElement("div");
            const range = document.createRange();
            range.setStartBefore(hr);
            range.setEndAfter(el.lastChild ?? hr);
            try {
                range.surroundContents(holder);
                blocks.push({ element: holder, code });
                replacedRegions.add(holder);
            } catch {
                blocks.push({ element: el, code });
                handledContainers.add(el);
            }
        }
    });

    // 2) 单个块元素形式：<p>flowchart TD\n  Start --> Stop</p>（正文直接在自己身上）
    root.querySelectorAll<HTMLElement>("p, div").forEach((el) => {
        if (el.closest("pre") || el.closest(".md-editor-code") || el.closest(".md-editor-mermaid") || el.closest("details")) return;
        for (const c of handledContainers) {
            if (c.contains(el)) return; // 已被 frontmatter 容器整体处理
        }
        for (const h of replacedRegions) {
            if (h.contains(el)) return; // 已被 frontmatter 局部区域处理
        }
        if (el.querySelector("p, div")) return; // 只处理叶子块
        const text = elementTextWithBreaks(el);
        const stripped = stripMermaidFrontmatter(text);
        if (!looksLikeMermaidSource(text) && !looksLikeMermaidSource(stripped)) return;
        blocks.push({ element: el, code: prepareMermaidSource(text) });
    });

    return blocks;
}

/** Mermaid 图表渲染 */
async function renderMermaid(root: HTMLElement) {
    const blocks: { element: Element; code: string }[] = [];
    // 后端已渲染 / 带 data-mermaid-code 标记的图表（anheyu 结构），前端补齐渲染
    root.querySelectorAll<HTMLElement>("div[data-mermaid-code]").forEach((div) => {
        const code = div.getAttribute("data-mermaid-code") || div.querySelector("code.language-mermaid")?.textContent || "";
        if (code.trim()) blocks.push({ element: div, code });
    });
    // 注意：`pre > code.language-mermaid` 代码框**不**自动渲染成图——用户要求代码框保留源码。
    // 兜底：后端未渲染、被 markdown 解析成裸文本的图表源码（ciraos 后端常见于 tabs 的"样式预览"tab）
    blocks.push(...collectMermaidTextBlocks(root));
    if (blocks.length === 0) return;

    try {
        const { default: mermaid } = await import("mermaid");
        // 深色模式用 mermaid dark 主题，浅色用 default
        const isDark = document.documentElement.classList.contains("dark");
        mermaid.initialize({
            startOnLoad: false,
            securityLevel: "loose",
            theme: isDark ? "dark" : "default",
            flowchart: { useMaxWidth: true, htmlLabels: true },
            sequence: { useMaxWidth: true },
            gantt: { useMaxWidth: true },
        });
        for (const block of blocks) {
            if (!block.element.isConnected) continue;
            try {
                const id = `mermaid-${Math.random().toString(36).slice(2, 11)}`;
                const { svg } = await mermaid.render(id, block.code);
                const wrapper = document.createElement("div");
                wrapper.className = "md-editor-mermaid";
                wrapper.setAttribute("data-mermaid-code", block.code);
                wrapper.innerHTML = svg;
                // 裸文本兜底可能命中 tab 容器：保留 .tab-item-content 本身（tabs 切换依赖它），只替换其子节点
                if (block.element.classList.contains("tab-item-content")) {
                    block.element.replaceChildren(wrapper);
                } else {
                    block.element.replaceWith(wrapper);
                }
            } catch {
                // 单个图表失败保留源码
            }
        }
    } catch {
        // mermaid 加载失败
    }
}

/** 音乐播放器增强：后端已渲染完整 UI（.music-player-container），这里绑定播放控制事件 */
function enhanceMusic(root: HTMLElement, cleanupFns: (() => void)[]) {
    const players = root.querySelectorAll<HTMLElement>(".markdown-music-player");
    players.forEach((player) => {
        // 已绑定过则跳过
        if (player.dataset.musicEnhanced === "true") return;
        player.dataset.musicEnhanced = "true";

        const container = player.querySelector<HTMLElement>(".music-player-container");
        if (!container) return;

        const audio = container.querySelector<HTMLAudioElement>(".music-audio-element");
        if (!audio || audio.dataset.eventsAttached) return;
        audio.dataset.eventsAttached = "true";

        const artwork = container.querySelector<HTMLElement>(".music-artwork-wrapper");
        const playIcon = container.querySelector<HTMLElement>(".music-play-icon");
        const pauseIcon = container.querySelector<HTMLElement>(".music-pause-icon");
        const progressFill = container.querySelector<HTMLElement>(".music-progress-fill");
        const progressBar = container.querySelector<HTMLElement>(".music-progress-bar");
        const currentTimeEl = container.querySelector<HTMLElement>(".current-time");
        const durationEl = container.querySelector<HTMLElement>(".duration");
        const errorEl = container.querySelector<HTMLElement>(".music-error");

        // 封面图加载失败（占位图 404 等）→ 隐藏破图，显示音符占位背景
        const coverImg = container.querySelector<HTMLImageElement>("img.artwork-image");
        if (coverImg && !coverImg.dataset.coverFallback) {
            coverImg.dataset.coverFallback = "1";
            const hideBrokenCover = () => {
                coverImg.style.display = "none";
            };
            coverImg.addEventListener("error", hideBrokenCover);
            if (coverImg.complete && coverImg.naturalWidth === 0) hideBrokenCover();
        }

        let audioLoaded = false;

        // 解析 data-music-data
        const dataAttr = player.getAttribute("data-music-data") || "";
        let musicData: Record<string, string> = {};
        try {
            musicData = JSON.parse(dataAttr.replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, "&"));
        } catch {
            musicData = {};
        }
        const neteaseId = player.getAttribute("data-music-id") || musicData.neteaseId || "";

        const formatTime = (s: number) => {
            if (!isFinite(s) || s < 0) return "00:00";
            const mins = Math.floor(s / 60);
            const secs = Math.floor(s % 60);
            return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
        };

        const loadAudio = async () => {
            if (audioLoaded || !neteaseId) {
                if (!neteaseId && errorEl) errorEl.style.display = "flex";
                return;
            }
            if (errorEl) errorEl.style.display = "none";
            try {
                const res = await fetch("/api/public/music/song-resources", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ neteaseId }),
                });
                const json = (await res.json()) as { code: number; data?: { audioUrl?: string } };
                const url = json.data?.audioUrl;
                if (!res.ok || !url) {
                    if (errorEl) errorEl.style.display = "flex";
                    return;
                }
                const httpsUrl = url.startsWith("http://") ? url.replace("http://", "https://") : url;
                audio.src = httpsUrl;
                audio.preload = "metadata";
                audioLoaded = true;
                audio.addEventListener("loadedmetadata", () => {
                    if (durationEl) durationEl.textContent = formatTime(audio.duration);
                });
            } catch {
                if (errorEl) errorEl.style.display = "flex";
            }
        };

        const toggle = async () => {
            if (!audioLoaded) await loadAudio();
            if (!audio.src) return;
            if (audio.paused) {
                audio.play().catch(() => {});
            } else {
                audio.pause();
            }
        };

        artwork?.addEventListener("click", toggle);
        progressBar?.addEventListener("click", (e) => {
            const rect = progressBar.getBoundingClientRect();
            if (audio.duration) {
                audio.currentTime = ((e.clientX - rect.left) / rect.width) * audio.duration;
            }
        });

        audio.addEventListener("play", () => {
            artwork?.classList.add("is-playing");
            if (playIcon) playIcon.style.display = "none";
            if (pauseIcon) pauseIcon.style.display = "block";
        });
        audio.addEventListener("pause", () => {
            artwork?.classList.remove("is-playing");
            if (playIcon) playIcon.style.display = "block";
            if (pauseIcon) pauseIcon.style.display = "none";
        });
        audio.addEventListener("timeupdate", () => {
            if (progressFill && audio.duration) {
                progressFill.style.width = `${(audio.currentTime / audio.duration) * 100}%`;
            }
            if (currentTimeEl) currentTimeEl.textContent = formatTime(audio.currentTime);
        });
        audio.addEventListener("ended", () => {
            audio.currentTime = 0;
            artwork?.classList.remove("is-playing");
        });

        // 预加载元数据以显示时长
        if (neteaseId) void loadAudio();

        cleanupFns.push(() => {
            audio.pause();
            audio.src = "";
        });
    });
}

// ===================== 组件 =====================

export function ArticleBody({
    html,
    codeBlock,
    copyCopyright,
}: {
    html: string;
    /** 代码块配置（site-config post.code_block）：mac 风格、超过多少行折叠 */
    codeBlock?: { codeMaxLines?: number; macStyle?: boolean };
    /** 复制正文的版权配置（site-config post.copy.*）：启用时复制正文会在末尾追加版权声明 */
    copyCopyright?: ArticleCopyCopyrightConfig | null;
}) {
    const ref = useRef<HTMLDivElement>(null);

    // 代码块配置缺省值：默认不显示 mac 圆点、10 行折叠（useMemo 稳定引用，避免 effect 频繁重跑）
    const codeBlockOpts = useMemo<CodeBlockOptions>(
        () => ({
            codeMaxLines: codeBlock?.codeMaxLines ?? 10,
            macStyle: codeBlock?.macStyle ?? false,
        }),
        [codeBlock?.codeMaxLines, codeBlock?.macStyle]
    );

    // ── 复制正文：post.copy.enable / post.copy.copyright_enable ──
    // 官方实现（PostContent/index.tsx 第 45-111 行）在 document 上以捕获阶段监听 copy：
    //   enable === false          → 禁止复制正文
    //   copyright_enable === true → 选区文本末尾追加 "\n\n---\n" + 版权文案
    // 这里同样挂在 document 上（选区可能跨正文节点），但只处理落在正文容器内的选择区域。
    const copyEnable = copyCopyright?.enable;
    const copyCopyrightEnable = copyCopyright?.copyrightEnable;
    const copyOriginalTemplate = copyCopyright?.copyrightOriginal;
    const copyReprintTemplate = copyCopyright?.copyrightReprint;
    const copySiteName = copyCopyright?.siteName;
    const copyAuthor = copyCopyright?.author;
    const copyIsReprint = copyCopyright?.isReprint;
    const copyCopyrightAuthor = copyCopyright?.copyrightAuthor;
    const copyCopyrightUrl = copyCopyright?.copyrightUrl;

    useEffect(() => {
        const root = ref.current;
        if (!root) return;

        // 配置没取到（undefined）：不拦截、不追加
        if (copyEnable === undefined) return;

        if (copyEnable === false) {
            const preventCopy = (e: ClipboardEvent) => {
                if (root.contains(e.target as Node)) e.preventDefault();
            };
            document.addEventListener("copy", preventCopy, true);
            return () => document.removeEventListener("copy", preventCopy, true);
        }

        if (copyCopyrightEnable !== true) return;

        const handleCopy = (e: ClipboardEvent) => {
            const selection = window.getSelection();
            const selectedText = selection?.toString() ?? "";
            if (!selection || selectedText.length === 0) return;

            const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
            if (!range) return;
            const container = range.commonAncestorContainer;
            const target = container.nodeType === Node.TEXT_NODE ? container.parentElement : (container as HTMLElement);
            if (!target || !root.contains(target)) return;

            const copyrightText = renderCopyCopyrightText({
                copyrightOriginal: copyOriginalTemplate,
                copyrightReprint: copyReprintTemplate,
                isReprint: copyIsReprint === true,
                copyrightAuthor: copyCopyrightAuthor,
                copyrightUrl: copyCopyrightUrl,
                siteName: copySiteName ?? "",
                author: copyAuthor ?? "",
                currentUrl: window.location.href,
            });

            e.clipboardData?.setData("text/plain", `${selectedText}\n\n---\n${copyrightText}`);
            e.preventDefault();
        };

        document.addEventListener("copy", handleCopy, true);
        return () => document.removeEventListener("copy", handleCopy, true);
    }, [
        copyEnable,
        copyCopyrightEnable,
        copyOriginalTemplate,
        copyReprintTemplate,
        copySiteName,
        copyAuthor,
        copyIsReprint,
        copyCopyrightAuthor,
        copyCopyrightUrl,
    ]);

    useEffect(() => {
        const root = ref.current;
        if (!root) return;
        const cleanups: (() => void)[] = [];

        // 代码块高亮 + mac 风格 + 行数折叠（原有点击复制/语言标签保留）
        root.querySelectorAll<HTMLPreElement>("pre").forEach((pre) => enhanceBlock(pre, codeBlockOpts));
        enhanceHeadings(root);

        // 跨页面锚点跳转：标题 id 是客户端生成的，挂载后再根据 URL hash 滚动到对应标题
        const hash = window.location.hash;
        if (hash) {
            const id = decodeURIComponent(hash.slice(1));
            const target = document.getElementById(id);
            if (target) {
                window.setTimeout(() => {
                    target.scrollIntoView({ behavior: "smooth", block: "start" });
                }, 100);
            }
        }

        // 公式 katex 前端渲染（ciraos 后端只输出 data-latex + 裸文本）
        enhanceKatex(root);

        // 插件增强
        enhanceInlineText(root);
        enhanceFolding(root);
        enhanceAdmonition(root);
        enhanceExternalLinks(root);
        enhanceTabs(root);
        enhanceTips(root, cleanups);
        enhanceHidden(root);
        enhancePasswords(root);
        enhanceLinkCards(root);
        enhanceMusic(root, cleanups);
        void renderMermaid(root);

        // 主题切换时重渲染 mermaid（深色/浅色用不同 mermaid 主题）
        const themeObserver = new MutationObserver(() => {
            void renderMermaid(root);
        });
        themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
        cleanups.push(() => themeObserver.disconnect());

        return () => {
            cleanups.forEach((fn) => fn());
        };
    }, [html, codeBlockOpts]);

    return (
        <div
            ref={ref}
            className="article-body mt-6"
            dangerouslySetInnerHTML={{ __html: html }}
        />
    );
}
