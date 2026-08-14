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
            // 非安全上下文时的降级方案
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

    // 1) 语法高亮
    hljs.highlightElement(codeEl);

    // 2) 行号栏 + 代码横向滚动容器
    const details = pre.closest<HTMLElement>("details.md-editor-code");
    const summary = details?.querySelector("summary") ?? null;
    const originalParent = pre.parentNode;
    const originalNext = pre.nextSibling;

    const body = document.createElement("div");
    body.className = "code-block-body";
    body.appendChild(makeLineNumbers(codeEl));
    body.appendChild(pre); // 把 pre 移入 body

    // 3) 后端 md-editor 结构：details + summary（语言标签已存在，只加复制按钮）
    if (details && summary) {
        details.insertBefore(body, summary.nextSibling);
        if (!summary.querySelector(".code-copy-btn")) {
            summary.appendChild(makeCopyButton(codeEl));
        }
        return;
    }

    // 4) 普通 pre > code：包一层 .code-block（head + body）
    const lang = detectLanguage(codeEl);
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

export function ArticleBody({ html }: { html: string }) {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const root = ref.current;
        if (!root) return;
        root.querySelectorAll<HTMLPreElement>("pre").forEach(enhanceBlock);
        enhanceHeadings(root);
    }, [html]);

    return (
        <div
            ref={ref}
            className="article-body mt-6"
            dangerouslySetInnerHTML={{ __html: html }}
        />
    );
}
