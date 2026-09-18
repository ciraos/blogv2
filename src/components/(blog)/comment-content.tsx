"use client";

import { useEffect, useMemo, useRef } from "react";

import { DEFAULT_CODE_BLOCK_OPTIONS, enhanceCodeBlocks, type CodeBlockOptions } from "@/lib/code-block";

interface CommentContentProps {
    /** 后端返回的评论 HTML（content_html） */
    html: string;
    /** 代码块配置（site-config post.code_block）：与文章正文同一套，保证两处代码框表现一致 */
    codeBlock?: { codeMaxLines?: number; macStyle?: boolean };
}

/**
 * 评论正文渲染（评论区专用）：
 * - 不复用 ArticleBody，评论区里不会有正文的段落间距 / 首字下沉 / 标题锚点等样式；
 * - 只做一件事：把正文里的 <pre> 代码块增强成与文章一致的代码框
 *   （语法高亮 + 语言标签 + mac 圆点 + 行号栏 + 行数折叠 + 收缩 + 复制按钮）；
 * - 代码块配置是客户端异步取到的，配置到位后会按新配置重建一次（见 useEffect 里的 innerHTML 还原）。
 */
export function CommentContent({ html, codeBlock }: CommentContentProps) {
    const ref = useRef<HTMLDivElement>(null);

    const options = useMemo<CodeBlockOptions>(
        () => ({
            codeMaxLines: codeBlock?.codeMaxLines ?? DEFAULT_CODE_BLOCK_OPTIONS.codeMaxLines,
            macStyle: codeBlock?.macStyle ?? DEFAULT_CODE_BLOCK_OPTIONS.macStyle,
        }),
        [codeBlock?.codeMaxLines, codeBlock?.macStyle]
    );

    useEffect(() => {
        const root = ref.current;
        if (!root) return;
        // 用原始 HTML 还原后再增强：配置变化（如 site-config 异步到位）时可无残留地重建，
        // 避免已增强的代码块被 dataset 标记挡住、无法按新配置重新折叠 / 补 mac 圆点。
        root.innerHTML = html;
        enhanceCodeBlocks(root, options);
    }, [html, options]);

    return <div ref={ref} className="comment-content" dangerouslySetInnerHTML={{ __html: html }} />;
}
