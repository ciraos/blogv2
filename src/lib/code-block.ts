// 代码块增强（文章正文 / 评论区共用同一套增强逻辑，保证两处代码框表现一致）：
//   hljs 语法高亮 + 语言标签 + mac 三个圆点 + 行号栏 + 行数折叠 + 左上角收缩 + 右上角复制
//
// 说明：本模块只做「代码块」这一件事，不依赖 katex / mermaid，也不绑定任何容器类名，
// 由调用方（ArticleBody / CommentContent）决定增强哪些 pre，作用域各自独立。
import { toast } from "sonner";

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

/** 从 code 元素上读取语言（language-xxx class），返回原始语言名（含 plaintext，用于显示语言标签） */
function detectLanguage(codeEl: HTMLElement): string {
    for (const cls of codeEl.classList) {
        if (cls.startsWith("language-")) {
            return cls.slice("language-".length);
        }
    }
    return "";
}

/** 复制按钮：图标按钮，无背景无边框，复制成功后右上角 toast */
function makeCopyButton(codeEl: HTMLElement): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "code-copy-btn";
    btn.title = "复制代码";
    btn.setAttribute("aria-label", "复制代码");
    btn.innerHTML =
        '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';

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
        toast.success("复制成功！");
        btn.classList.add("copied");
        window.setTimeout(() => btn.classList.remove("copied"), 1500);
    });

    return btn;
}

/** 底部「展开 / 收起」按钮：行数超过 code_max_lines 时折叠，点击切换 */
function makeExpandButton(body: HTMLElement): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "code-expand-btn";
    btn.textContent = "展开 ▼";
    btn.setAttribute("aria-label", "展开代码");
    btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const collapsed = body.classList.toggle("code-collapsed");
        // 折叠高度是内联 maxHeight（见 enhanceBlock），展开时必须清除，折叠时恢复
        body.style.maxHeight = collapsed ? body.dataset.collapsedHeight || "" : "";
        btn.textContent = collapsed ? "展开 ▼" : "收起 ▲";
        btn.classList.toggle("expanded", !collapsed);
    });
    return btn;
}

/** 左上角「展开 / 收缩」按钮：点击后代码完全收起（只留带语言标签的头部一行），再点恢复。
 *  完全收起时底部「展开/收起」按钮一并隐藏，恢复时重新显示。 */
function makeCollapseButton(body: HTMLElement): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "code-collapse-btn";
    btn.title = "收缩代码";
    btn.setAttribute("aria-label", "收缩代码");
    btn.textContent = "▼";
    btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const hidden = body.classList.toggle("code-hidden");
        // 底部行数展开/收起按钮与代码一起隐藏（恢复时重新显示）
        const expandBtn = body.parentElement?.querySelector<HTMLElement>(".code-expand-btn");
        if (expandBtn) {
            expandBtn.style.display = hidden ? "none" : "";
        }
        btn.textContent = hidden ? "▶" : "▼";
        btn.title = hidden ? "展开代码" : "收缩代码";
        btn.setAttribute("aria-label", hidden ? "展开代码" : "收缩代码");
    });
    return btn;
}

/** 统计代码行数（去掉末尾换行） */
function countCodeLines(text: string): number {
    if (!text) return 0;
    return text.replace(/\n$/, "").split("\n").length;
}

/** 代码块配置（来自 site-config post.code_block） */
export interface CodeBlockOptions {
    codeMaxLines: number;
    macStyle: boolean;
}

/** 代码块配置缺省值：默认不显示 mac 圆点、10 行折叠 */
export const DEFAULT_CODE_BLOCK_OPTIONS: CodeBlockOptions = { codeMaxLines: 10, macStyle: false };

/** 增强一个 <pre> 代码块：高亮 + mac 风格 + 行数折叠 + 复制按钮 + 语言标签 */
export function enhanceBlock(pre: HTMLPreElement, options: CodeBlockOptions) {
    const codeEl = pre.querySelector<HTMLElement>("code");
    if (!codeEl || codeEl.dataset.enhanced === "true") return;
    codeEl.dataset.enhanced = "true";

    // mermaid 代码块不在此处理（单独渲染图表）
    if (codeEl.classList.contains("language-mermaid") || pre.closest("[data-mermaid-code]")) return;

    // 1) 语法高亮：后端 md-editor 的 code 内含 <span class="md-editor-code-block"> 与行号 span，
    //    highlightElement 会用 innerHTML 整体替换导致结构丢失/报错，
    //    所以改为：取纯文本 → hljs.highlight() → 保留 md-editor-code-block 结构重新注入。
    //    label 用于显示语言标签（plaintext 也照常显示）；plaintext 不参与高亮，维持自动识别的原有行为。
    const label = detectLanguage(codeEl);
    const lang = label === "plaintext" ? "" : label;
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

    // 移除后端自带的行号占位 span（rn-wrapper，前端用自建行号栏，避免干扰渲染/行号对齐）
    codeEl.querySelectorAll<HTMLElement>("[rn-wrapper]").forEach((el) => el.remove());

    // 2) 行号栏 + 代码横向滚动容器
    const details = pre.closest<HTMLElement>("details.md-editor-code");
    const summary = details?.querySelector("summary") ?? null;
    const originalParent = pre.parentNode;
    const originalNext = pre.nextSibling;

    const body = document.createElement("div");
    body.className = "code-block-body";
    body.appendChild(makeLineNumbers(codeEl));
    body.appendChild(pre);

    // 3) 确定容器与头部（mac 圆圈 / 语言标签 / 按钮都挂在头部）
    let container: HTMLElement;
    let head: HTMLElement;
    if (details && summary) {
        details.insertBefore(body, summary.nextSibling);
        container = details;
        head = summary;
    } else {
        // 普通 pre > code：包一层 .code-block（head + body）
        const wrapper = document.createElement("div");
        wrapper.className = "code-block";

        const headEl = document.createElement("div");
        headEl.className = "code-block-head";
        if (label) {
            const langLabel = document.createElement("span");
            langLabel.className = "code-block-lang";
            langLabel.textContent = label;
            headEl.appendChild(langLabel);
        }

        wrapper.appendChild(headEl);
        wrapper.appendChild(body);
        originalParent?.insertBefore(wrapper, originalNext ?? null);
        container = wrapper;
        head = headEl;
    }

    // 行数折叠：超过 code_max_lines 行 → 折叠 + 底部展开按钮
    const lineCount = countCodeLines(rawText);
    if (options.codeMaxLines > 0 && lineCount > options.codeMaxLines) {
        body.classList.add("code-collapsed");
        // 折叠高度：pre 上下 padding + N 行 × 行高（行号栏与 pre 同高，一起截断）；
        // 存入 dataset，供展开按钮恢复/清除
        const preStyle = getComputedStyle(pre);
        const lineHeight = parseFloat(preStyle.lineHeight) || 22;
        const padTop = parseFloat(preStyle.paddingTop) || 14;
        const padBottom = parseFloat(preStyle.paddingBottom) || 14;
        body.dataset.collapsedHeight = `${padTop + padBottom + lineHeight * options.codeMaxLines}px`;
        body.style.maxHeight = body.dataset.collapsedHeight;
        container.appendChild(makeExpandButton(body));
    }

    // 左上角展开 / 收缩按钮（完全折叠：只留语言标签那一行）——始终放在最左边
    const collapseBtn = makeCollapseButton(body);
    head.prepend(collapseBtn);

    // mac 三个圆圈：真实元素（可排在按钮之后）；mac_style=true 时插入
    if (options.macStyle) {
        const dots = document.createElement("span");
        dots.className = "code-dots";
        dots.setAttribute("aria-hidden", "true");
        collapseBtn.after(dots);
    }

    // 右上角复制按钮
    if (!head.querySelector(".code-copy-btn")) {
        head.appendChild(makeCopyButton(codeEl));
    }
}

/** 批量增强 root 下所有 <pre> 代码块（已增强过的会自动跳过） */
export function enhanceCodeBlocks(root: HTMLElement, options: CodeBlockOptions) {
    root.querySelectorAll<HTMLPreElement>("pre").forEach((pre) => enhanceBlock(pre, options));
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
