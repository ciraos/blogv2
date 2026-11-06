"use client";

import { useMemo, useState } from "react";
import { Bot, ChevronDown, ChevronUp } from "lucide-react";

interface ArticleSummaryProps {
    /**
     * 文章摘要（后端 `summaries: string[]`，一行一条）。
     * 来源是后台「文章 → 摘要 & SEO」里的摘要框，可以用「AI 生成摘要」自动写完再手改。
     */
    summaries?: string[] | null;
}

/** 超过这个长度才出现「展开全文」：短摘要本来就该一眼看完，多一个按钮反而碍眼 */
const CLAMP_THRESHOLD = 160;

/**
 * 摘要的**显示**清洗（数据库里的原文不动，后台仍看到/编辑原样）。
 *
 * 为什么需要：摘要框常混进 AI 照抄原文留下的残渣 —— 整段 ``` 代码块、
 * `{tip …}{/tip}` `{btn …}` 这类短代码、行首的 `#` 标题。这些放进「摘要」卡只会撑高版面、
 * 完全看不出重点（实测 0ZzL 那条摘要里就有一整段 bash 和 nginx 配置）。
 * 只处理这几种明显的标记，普通标点、引号、括号一律不动。
 */
function toDisplayText(lines: string[]): string {
    return lines
        .join("\n")
        .replace(/```[\s\S]*?```/g, " ") // 代码块整段去掉
        .replace(/\{\/?[a-zA-Z][^{}]*\}/g, " ") // 短代码标签（{tip …}、{/tip}、{btn …}）
        .replace(/(^|\s)#{1,6}\s+/g, "$1") // 标题井号（摘要常被压成一行，行首/行中都要处理）
        .replace(/[ \t]+\n/g, "\n")
        .replace(/[ \t]{2,}/g, " ")
        .replace(/\n{2,}/g, "\n")
        .trim();
}

/**
 * 文章顶部的「摘要」卡片。
 *
 * 为什么不直接塞进正文 HTML：摘要是**元数据**，跟正文一起滚走就没人看了；
 * 单独一张卡放在标题之下、正文之前，
 * 让读者先判断"这篇是不是我要的"，再决定要不要往下读。
 *
 * 渲染口径：**纯文本**（`whitespace-pre-line` 保留换行），不按 Markdown 渲染。
 * 摘要是后台手填 / AI 生成的自由文本，里面偶尔会混进 ``` 或 {tip} 这种原文残渣，
 * 当 Markdown 渲染会拼出莫名其妙的版式；当纯文本至少不会骗人。
 */
export function ArticleSummary({ summaries }: ArticleSummaryProps) {
    /** 一行一条 → 拼接成像样的多段文本（空行丢掉，避免摘要框里的占位行撑出空白） */
    const text = useMemo(
        () => toDisplayText((summaries ?? []).map((line) => line.trim()).filter(Boolean)),
        [summaries]
    );
    const [expanded, setExpanded] = useState(false);

    /**
     * 没有摘要时**不隐藏**，而是明说「此篇文章无摘要」：
     * 摘要卡是文章页固定的一栏，忽有忽无会让相邻文章的版式来回跳；
     * 空着也比让人猜"这篇是不是漏了摘要"更好。
     * 样式上用虚线框 + 灰字，跟有摘要时的实线主色卡区分开（一眼看出是空状态）。
     */
    if (!text) {
        return (
            <section
                aria-label="文章摘要"
                className="mt-6 overflow-hidden rounded-xl border border-dashed border-border bg-muted/30"
            >
                <div className="flex items-center gap-2 px-4 pt-3 text-muted-foreground md:px-5 md:pt-4">
                    <Bot className="size-4 shrink-0" aria-hidden />
                    <span className="text-sm font-medium">文章摘要</span>
                </div>
                <p className="px-4 pt-1.5 pb-3 text-sm italic text-muted-foreground/70 md:px-5 md:pb-4">
                    此篇文章无摘要
                </p>
            </section>
        );
    }

    const collapsible = text.length > CLAMP_THRESHOLD;

    return (
        <section
            aria-label="文章摘要"
            className="mt-6 overflow-hidden rounded-xl border border-primary/25 bg-primary/[0.045]"
        >
            <div className="flex items-center gap-2 px-4 pt-3 text-primary md:px-5 md:pt-4">
                <Bot className="size-4 shrink-0" aria-hidden />
                <span className="text-sm font-medium">文章摘要</span>
            </div>
            <p
                className={`whitespace-pre-line px-4 pt-1.5 pb-3 text-sm leading-relaxed text-muted-foreground md:px-5 md:pb-4 ${
                    !expanded && collapsible ? "line-clamp-4" : ""
                }`}
            >
                {text}
            </p>
            {collapsible && (
                <button
                    type="button"
                    onClick={() => setExpanded((open) => !open)}
                    aria-expanded={expanded}
                    className="mb-3 ml-4 inline-flex items-center gap-0.5 rounded-md px-1 text-xs font-medium text-primary transition-opacity hover:opacity-80 md:ml-5"
                >
                    {expanded ? "收起" : "展开全文"}
                    {expanded ? <ChevronUp className="size-3.5" aria-hidden /> : <ChevronDown className="size-3.5" aria-hidden />}
                </button>
            )}
        </section>
    );
}
