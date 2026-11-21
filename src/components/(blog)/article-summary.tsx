"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, ChevronDown, ChevronUp } from "lucide-react";

interface ArticleSummaryProps {
    /**
     * 文章摘要（后端 `summaries: string[]`，一行一条）。
     * 来源是后台「文章 → 摘要 & SEO」里的摘要框，可以用「AI 生成摘要」自动写完再手改。
     */
    summaries?: string[] | null;
}

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
     * 是否真的需要「展开全文」：**实测**折叠后有没有溢出，而不是靠字数猜。
     * 以前用「字数 > 160 就显示按钮」的阈值，结果两百来字的摘要其实一眼能看完，
     * 按钮却还在，且折叠高度和实际行数对不上（最后半行被裁掉）。
     */
    const textRef = useRef<HTMLSpanElement>(null);
    const [overflowing, setOverflowing] = useState(false);

    useEffect(() => {
        const el = textRef.current;
        if (!el) return;
        let cancelled = false;

        const measure = () => {
            if (cancelled) return;
            // 折叠态下 scrollHeight 是全文高度、clientHeight 是 6 行高度，差值 > 2px 即说明被裁了
            setOverflowing(el.scrollHeight - el.clientHeight > 2);
        };

        // 首帧用宏任务兜一下：effect 内同步 setState 会被 react-hooks/set-state-in-effect 拦
        const timer = window.setTimeout(measure, 0);
        // 宽度变化（窗口缩放 / 侧栏收缩）会改变行数，重新量
        const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
        observer?.observe(el);

        return () => {
            cancelled = true;
            window.clearTimeout(timer);
            observer?.disconnect();
        };
    }, [text, expanded]);

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
                className="mt-6 overflow-hidden border border-dashed border-border bg-transparent"
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

    const collapsible = overflowing;

    return (
        <section
            aria-label="文章摘要"
            className="mt-6 overflow-hidden border border-primary/25 bg-primary/[0.03]"
        >
            <div className="flex items-center gap-2 px-4 pt-3 text-primary md:px-5 md:pt-4">
                <Bot className="size-4 shrink-0" aria-hidden />
                <span className="text-sm font-medium">文章摘要</span>
            </div>
            {/*
              折叠必须作用在**没有内边距的内层**上：overflow: hidden 的裁剪边界是 padding box，
              直接把 line-clamp 写在外层 <p>（带 pb-3）上时，第 7 行会画进下内边距里露出来半截。
              所以外层只管内边距/字号，内层 span 只管行数与裁剪。
            */}
            <p className="px-4 pt-1.5 pb-3 text-sm leading-relaxed text-muted-foreground md:px-5 md:pb-4">
                <span
                    ref={textRef}
                    className="block whitespace-pre-line"
                    style={
                        expanded
                            ? undefined
                            : {
                                  display: "-webkit-box",
                                  WebkitBoxOrient: "vertical",
                                  WebkitLineClamp: 6,
                                  overflow: "hidden",
                              }
                    }
                >
                    {text}
                </span>
            </p>
            {(collapsible || expanded) && (
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
