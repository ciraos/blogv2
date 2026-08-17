"use client";

import { useEffect, useRef } from "react";

import hljs from "highlight.js/lib/core";
import type { LanguageFn } from "highlight.js";
import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import css from "highlight.js/lib/languages/css";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import go from "highlight.js/lib/languages/go";
import ini from "highlight.js/lib/languages/ini";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import kotlin from "highlight.js/lib/languages/kotlin";
import markdown from "highlight.js/lib/languages/markdown";
import php from "highlight.js/lib/languages/php";
import python from "highlight.js/lib/languages/python";
import ruby from "highlight.js/lib/languages/ruby";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import swift from "highlight.js/lib/languages/swift";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import "highlight.js/styles/atom-one-light.css";

const commonLanguages: Record<string, LanguageFn> = {
    bash, c, cpp, csharp, css, dockerfile, go, ini, java,
    javascript, json, kotlin, markdown, php, python, ruby,
    rust, sql, swift, typescript, xml, yaml,
};

for (const [name, language] of Object.entries(commonLanguages)) {
    if (!hljs.getLanguage(name)) {
        hljs.registerLanguage(name, language);
    }
}

// ===================== 代码块增强（原有） =====================

/** 从 code 元素上读取语言（language-xxx class） */
function detectLanguage(codeEl: HTMLElement): string {
    for (const cls of codeEl.classList) {
        if (cls.startsWith("language-")) {
            const lang = cls.slice("language-".length);
            return lang === "plaintext" ? "" : lang;
        }
    }
    return "";
}

/** 创建复制按钮 */
function makeCopyButton(codeEl: HTMLElement): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "code-copy-btn";
    btn.textContent = "复制";
    btn.setAttribute("aria-label", "复制代码");

    btn.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        try {
            await navigator.clipboard.writeText(codeEl.innerText);
        } catch {
            const textarea = document.createElement("textarea");
            textarea.value = codeEl.innerText;
            textarea.style.position = "fixed";
            textarea.style.opacity = "0";
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand("copy");
            document.body.removeChild(textarea);
        }
        btn.textContent = "已复制";
        btn.classList.add("copied");
        window.setTimeout(() => {
            btn.textContent = "复制";
            btn.classList.remove("copied");
        }, 1500);
    });

    return btn;
}

/** 增强一个 <pre> 代码块：高亮 + 复制按钮 + 语言标签 */
function enhanceBlock(pre: HTMLPreElement) {
    const codeEl = pre.querySelector<HTMLElement>("code");
    if (!codeEl || codeEl.dataset.enhanced === "true") return;
    codeEl.dataset.enhanced = "true";

    // mermaid 代码块不在此处理（单独渲染图表）
    if (codeEl.classList.contains("language-mermaid") || pre.closest("[data-mermaid-code]")) return;

    // 1) 语法高亮：后端 md-editor 的 code 内含 <span class="md-editor-code-block"> 与行号 span，
    //    highlightElement 会用 innerHTML 整体替换导致结构丢失/报错，
    //    所以改为：取纯文本 → hljs.highlight() → 保留 md-editor-code-block 结构重新注入。
    const lang = detectLanguage(codeEl);
    const rawText = codeEl.textContent ?? "";
    const highlighted = lang && hljs.getLanguage(lang)
        ? hljs.highlight(rawText, { language: lang, ignoreIllegals: true }).value
        : hljs.highlightAuto(rawText).value;

    const codeBlock = codeEl.querySelector<HTMLElement>(".md-editor-code-block");
    if (codeBlock) {
        codeBlock.innerHTML = highlighted;
    } else {
        codeEl.innerHTML = highlighted;
    }
    codeEl.classList.add("hljs");

    // 2) 行号栏 + 代码横向滚动容器
    const details = pre.closest<HTMLElement>("details.md-editor-code");
    const summary = details?.querySelector("summary") ?? null;
    const originalParent = pre.parentNode;
    const originalNext = pre.nextSibling;

    const body = document.createElement("div");
    body.className = "code-block-body";
    body.appendChild(makeLineNumbers(codeEl));
    body.appendChild(pre);

    // 3) 后端 md-editor 结构：details + summary（语言标签已存在，只加复制按钮）
    if (details && summary) {
        details.insertBefore(body, summary.nextSibling);
        if (!summary.querySelector(".code-copy-btn")) {
            summary.appendChild(makeCopyButton(codeEl));
        }
        return;
    }

    // 4) 普通 pre > code：包一层 .code-block（head + body）
    const wrapper = document.createElement("div");
    wrapper.className = "code-block";

    const head = document.createElement("div");
    head.className = "code-block-head";
    if (lang) {
        const label = document.createElement("span");
        label.className = "code-block-lang";
        label.textContent = lang;
        head.appendChild(label);
    }
    head.appendChild(makeCopyButton(codeEl));

    wrapper.appendChild(head);
    wrapper.appendChild(body);
    originalParent?.insertBefore(wrapper, originalNext ?? null);
}

/** 生成行号栏（与代码行高对齐） */
function makeLineNumbers(codeEl: HTMLElement): HTMLElement {
    const text = codeEl.textContent ?? "";
    const count = Math.max(1, text.replace(/\n$/, "").split("\n").length);

    const gutter = document.createElement("div");
    gutter.className = "line-numbers";
    gutter.setAttribute("aria-hidden", "true");
    for (let i = 1; i <= count; i++) {
        const line = document.createElement("div");
        line.textContent = String(i);
        gutter.appendChild(line);
    }
    return gutter;
}

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
        const activeBtn = container.querySelector(".nav-tabs .tab.active");
        if (tabs.length > 0) {
            if (!activeBtn) tabs[0].classList.add("active");
            const activeIdx = activeBtn ? Array.from(tabs).indexOf(activeBtn) : 0;
            if (!container.querySelector(".tab-item-content.active") && contents[activeIdx]) {
                contents[activeIdx].classList.add("active");
            }
        }
    });
}

/** Tip 提示（hover / click） */
function enhanceTips(root: HTMLElement, cleanupFns: (() => void)[]) {
    root.querySelectorAll<HTMLElement>(".anzhiyu-tip-wrapper").forEach((wrapper) => {
        const tipText = wrapper.querySelector<HTMLElement>(".anzhiyu-tip-text");
        const tip = wrapper.querySelector<HTMLElement>(".anzhiyu-tip");
        if (!tipText || !tip) return;

        const trigger = tip.getAttribute("data-trigger") || "hover";
        const delay = parseInt(tip.getAttribute("data-delay") || "0", 10);

        const showTip = () => {
            tip.style.visibility = "visible";
            tip.style.opacity = "1";
            tip.classList.add("show");
            tip.setAttribute("data-visible", "true");
        };
        const hideTip = () => {
            tip.style.visibility = "hidden";
            tip.style.opacity = "0";
            tip.classList.remove("show");
            tip.setAttribute("data-visible", "false");
        };

        if (trigger === "click") {
            const handleClick = (e: Event) => {
                e.preventDefault();
                e.stopPropagation();
                const isVisible = tip.getAttribute("data-visible") === "true";
                if (isVisible) hideTip();
                else showTip();
            };
            const handleDocumentClick = (e: Event) => {
                if (!wrapper.contains(e.target as Node)) hideTip();
            };
            tipText.addEventListener("click", handleClick);
            document.addEventListener("click", handleDocumentClick);
            cleanupFns.push(() => {
                tipText.removeEventListener("click", handleClick);
                document.removeEventListener("click", handleDocumentClick);
            });
        } else {
            let showTimer: ReturnType<typeof setTimeout> | null = null;
            let hideTimer: ReturnType<typeof setTimeout> | null = null;
            const handleMouseEnter = () => {
                if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
                showTimer = setTimeout(showTip, delay);
            };
            const handleMouseLeave = () => {
                if (showTimer) { clearTimeout(showTimer); showTimer = null; }
                hideTimer = setTimeout(hideTip, 100);
            };
            tipText.addEventListener("mouseenter", handleMouseEnter);
            tipText.addEventListener("mouseleave", handleMouseLeave);
            cleanupFns.push(() => {
                tipText.removeEventListener("mouseenter", handleMouseEnter);
                tipText.removeEventListener("mouseleave", handleMouseLeave);
                if (showTimer) clearTimeout(showTimer);
                if (hideTimer) clearTimeout(hideTimer);
            });
        }
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
}

/** Mermaid 图表渲染 */
async function renderMermaid(root: HTMLElement) {
    const blocks: { element: Element; code: string }[] = [];
    root.querySelectorAll<HTMLElement>("div[data-mermaid-code]").forEach((div) => {
        const code = div.getAttribute("data-mermaid-code") || div.querySelector("code.language-mermaid")?.textContent || "";
        if (code.trim()) blocks.push({ element: div, code });
    });
    root.querySelectorAll<HTMLPreElement>("pre").forEach((pre) => {
        if (pre.closest("[data-mermaid-code]")) return;
        const codeEl = pre.querySelector<HTMLElement>("code.language-mermaid");
        if (codeEl) blocks.push({ element: pre, code: codeEl.textContent || "" });
    });
    if (blocks.length === 0) return;

    try {
        const { default: mermaid } = await import("mermaid");
        mermaid.initialize({
            startOnLoad: false,
            securityLevel: "loose",
            theme: "default",
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
                block.element.replaceWith(wrapper);
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

export function ArticleBody({ html }: { html: string }) {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const root = ref.current;
        if (!root) return;
        const cleanups: (() => void)[] = [];

        // 代码块高亮 + 标题锚点（原有）
        root.querySelectorAll<HTMLPreElement>("pre").forEach(enhanceBlock);
        enhanceHeadings(root);

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

        return () => {
            cleanups.forEach((fn) => fn());
        };
    }, [html]);

    return (
        <div
            ref={ref}
            className="article-body mt-6"
            dangerouslySetInnerHTML={{ __html: html }}
        />
    );
}
