"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import hljs from "highlight.js/lib/core";
import xml from "highlight.js/lib/languages/xml";
import { RotateCcw, Wand2, WrapText } from "lucide-react";

import { cn } from "@/lib/utils";

// HTML 高亮复用文章代码块那套 highlight.js（同一个包、同一份 xml 语法）
if (!hljs.getLanguage("xml")) hljs.registerLanguage("xml", xml);

/** 块级标签：只有它们之间才值得换行缩进。
 *  span / a / code / strong 这类行内标签之间**不能**插换行——HTML 会把换行渲染成一个空格，
 *  现有内容里 <span class="hljs-..."> 是成串挨着的，插进去就会改变显示效果。 */
const BLOCK_TAGS =
    "div|p|h[1-6]|ul|ol|li|details|summary|section|article|table|thead|tbody|tr|td|th|blockquote|figure|figcaption|dl|dt|dd|form|pre";

const OPEN_BLOCK = new RegExp(`<(?!/)(?:${BLOCK_TAGS})\\b`, "gi");
const CLOSE_BLOCK = new RegExp(`</(?:${BLOCK_TAGS})\\s*>`, "gi");

/**
 * 保守的 HTML 格式化：只做「块级标签之间换行 + 按层级缩进」。
 *
 * 为什么不用现成的 beautifier：这份内容是**后端渲染好的 HTML**，里面常有
 * `<pre><code>` 代码示例；通用美化器会把代码块里的每一行也重排，等于改掉正文内容。
 * 所以先把 <pre>/<code> 整段挖出来占位，处理完再原样放回。
 */
export function formatHtml(input: string): string {
    if (!input.trim()) return input;

    const blocks: string[] = [];
    let text = input.replace(/<(pre|code)\b[\s\S]*?<\/\1\s*>/gi, (match) => {
        blocks.push(match);
        return `\u0000${blocks.length - 1}\u0000`;
    });

    // 统一空白：换行/缩进压成单空格（HTML 渲染结果不变），方便后面重新分行
    text = text.replace(/\s+/g, " ").trim();

    // 块级标签边界处换行：闭合块级标签之后、开始块级标签之前
    text = text.replace(new RegExp(`(<\\/(?:${BLOCK_TAGS})\\s*>)\\s*(?=<)`, "gi"), "$1\n");
    text = text.replace(new RegExp(`(>)\\s*(<(?:${BLOCK_TAGS})\\b)`, "gi"), "$1\n$2");

    const lines = text.split("\n").filter((line) => line.trim());
    const out: string[] = [];
    let depth = 0;

    for (const line of lines) {
        const trimmed = line.trim();
        const leadingClose = /^<\//.test(trimmed) ? 1 : 0;
        out.push("  ".repeat(Math.max(0, depth - leadingClose)) + trimmed);

        const opens = (trimmed.match(OPEN_BLOCK) || []).length;
        const closes = (trimmed.match(CLOSE_BLOCK) || []).length;
        depth = Math.max(0, depth + opens - closes);
    }

    const formatted = out.join("\n");
    // 占位符还原成原始代码块
    return formatted.replace(/\u0000(\d+)\u0000/g, (_, index: string) => blocks[Number(index)] ?? "");
}

interface SettingsCodeFieldProps {
    value: string;
    onChange: (value: string) => void;
    /** highlight.js 的语言名，默认 html（对应 xml 语法） */
    language?: string;
    /** 编辑器高度（行数，按 20px 行高算） */
    rows?: number;
}

/**
 * 后台设置里的「代码」字段：等宽 + 行高 + 语法高亮 + 格式化按钮。
 *
 * 实现方式是经典的「透明 textarea 叠在高亮 pre 上」：
 * 真正可编辑的是 textarea（文字透明、只露光标），下面的 pre 负责显示带颜色的 HTML，
 * 两边字体/字号/行高/内边距完全一致，滚动时同步 scrollTop，看起来就像一个代码编辑器。
 * 这样做的好处是不引入新的编辑器依赖（Monaco/CodeMirror 都是几百 KB 起）。
 */
export function SettingsCodeField({ value, onChange, language = "html", rows = 16 }: SettingsCodeFieldProps) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const preRef = useRef<HTMLPreElement>(null);
    /** 格式化前的原文：只用于「还原」，用户手改后清掉 */
    const [undoValue, setUndoValue] = useState<string | null>(null);
    /** 自动换行开关：关掉后长行横向滚动（看整行结构时用） */
    const [softWrap, setSoftWrap] = useState(true);

    const highlighted = useMemo(() => {
        try {
            const html = hljs.highlight(value || " ", { language, ignoreIllegals: true }).value;
            // ⚠️ 这里原本无条件补一个换行，用来把「末尾的空行」也画出来。
            // 但 <pre> 会忽略内容末尾的换行（CSS 规范），补上去反而多出一行 —— 高亮层比输入层高一行，
            // 滚到底时看到的是「多出来的那一行」，点它光标就落到上一行。所以只在原文本来就以换行结尾时补。
            return value.endsWith("\n") ? `${html}\n` : html;
        } catch {
            return "";
        }
    }, [value, language]);

    const syncScroll = () => {
        if (!textareaRef.current || !preRef.current) return;
        // 夹到 pre 自己的最大滚动距离：两层内容高度只差半个像素时也不会把高亮层顶出去，
        // 否则会出现「看到的最后一行」和「光标实际落的行」错开一行的现象。
        const maxPre = Math.max(0, preRef.current.scrollHeight - preRef.current.clientHeight);
        preRef.current.scrollTop = Math.min(textareaRef.current.scrollTop, maxPre);
        preRef.current.scrollLeft = textareaRef.current.scrollLeft;
    };

    /**
     * 让高亮层的内容盒和 textarea **完全一致**。
     *
     * 关键点：Windows / Linux 用的是**经典滚动条**（占 15~17px 实体宽度），textarea 一旦出滚动条，
     * 它的可用宽度就比没有滚动条的 pre 窄——于是同一条长文本在两层里的折行位置不同，
     * 越往下偏移越大，最后表现为「点最后一行，光标落到上一行」。
     *
     * 这里把 textarea 实际被滚动条吃掉的宽度/高度，补成 pre 的右/下内边距，
     * 两层内容盒就一模一样了（overlay 滚动条平台上这两个值为 0，行为不变）。
     */
    const syncMetrics = () => {
        const ta = textareaRef.current;
        const pre = preRef.current;
        if (!ta || !pre) return;
        const BASE_PADDING = 12; // 与 p-3 对应
        const gutterX = ta.offsetWidth - ta.clientWidth; // 垂直滚动条宽度
        const gutterY = ta.offsetHeight - ta.clientHeight; // 水平滚动条高度
        pre.style.paddingRight = `${BASE_PADDING + gutterX}px`;
        pre.style.paddingBottom = `${BASE_PADDING + gutterY}px`;
        syncScroll();
    };

    useEffect(() => {
        syncMetrics();
        const host = textareaRef.current?.parentElement;
        if (!host || typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver(syncMetrics);
        observer.observe(host);
        return () => observer.disconnect();
        // value / softWrap 变化都会改变滚动条的有无，需要重新量
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value, softWrap]);

    const handleFormat = () => {
        const formatted = formatHtml(value);
        if (formatted === value) return;
        setUndoValue(value);
        onChange(formatted);
    };

    const handleUndo = () => {
        if (undoValue === null) return;
        onChange(undoValue);
        setUndoValue(null);
    };

    const height = `${rows * 20 + 24}px`;

    return (
        <div className="overflow-hidden rounded-lg border border-input bg-transparent">
            {/* 工具栏：语言标签 + 字符数 + 换行开关 + 格式化 / 还原 */}
            <div className="flex items-center gap-2 border-b bg-muted/40 px-2.5 py-1.5 text-[11px] text-muted-foreground">
                <span className="rounded bg-background px-1.5 py-0.5 font-medium uppercase">{language === "html" ? "HTML" : language}</span>
                <span className="tabular-nums">{value.length} 字符</span>
                {/* 换行开关：默认自动换行；关掉后长行横向滚动，方便看整行结构 */}
                <button
                    type="button"
                    onClick={() => setSoftWrap((on) => !on)}
                    aria-pressed={softWrap}
                    title={softWrap ? "当前自动换行，点击改为不换行（横向滚动）" : "当前不换行，点击恢复自动换行"}
                    className={cn(
                        "ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors hover:bg-background hover:text-foreground",
                        softWrap && "bg-background text-foreground"
                    )}
                >
                    <WrapText className="size-3.5" />
                    {softWrap ? "换行" : "不换行"}
                </button>
                <button
                    type="button"
                    onClick={handleFormat}
                    title="按标签层级重新缩进（代码块 <pre>/<code> 内部保持原样）"
                    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors hover:bg-background hover:text-foreground"
                >
                    <Wand2 className="size-3.5" />
                    格式化
                </button>
                {undoValue !== null && (
                    <button
                        type="button"
                        onClick={handleUndo}
                        title="恢复到格式化之前的文本"
                        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors hover:bg-background hover:text-foreground"
                    >
                        <RotateCcw className="size-3.5" />
                        还原
                    </button>
                )}
            </div>

            {/* 编辑区：pre 负责显示高亮，textarea 负责输入 */}
            <div className="settings-code relative" style={{ height }}>
                <pre
                    ref={preRef}
                    aria-hidden
                    className={cn(
                        "pointer-events-none absolute inset-0 m-0 overflow-hidden p-3 font-mono text-xs leading-5",
                        softWrap ? "whitespace-pre-wrap break-words" : "whitespace-pre"
                    )}
                >
                    <code dangerouslySetInnerHTML={{ __html: highlighted }} />
                </pre>
                <textarea
                    ref={textareaRef}
                    value={value}
                    onChange={(e) => {
                        setUndoValue(null);
                        onChange(e.target.value);
                    }}
                    onScroll={syncScroll}
                    wrap={softWrap ? "soft" : "off"}
                    spellCheck={false}
                    aria-label="代码内容"
                    className={cn(
                        // scrollbar-gutter: stable —— 滚动条宽度始终预留，
                        // 这样 syncMetrics 量到的 gutter 稳定，两层宽度不会因内容增减而跳变
                        "absolute inset-0 size-full resize-none overflow-auto rounded-none border-0 bg-transparent p-3 font-mono text-xs leading-5 text-transparent outline-none selection:bg-primary/25 [scrollbar-gutter:stable]",
                        softWrap ? "whitespace-pre-wrap break-words" : "whitespace-pre"
                    )}
                    style={{ caretColor: "var(--foreground)" }}
                />
            </div>
        </div>
    );
}
