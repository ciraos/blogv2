import type { ReactNode } from "react";

/** 转义正则元字符（用户输入直接进 RegExp 会炸，也会被当成模式） */
function escapeRegExp(input: string): string {
    return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 把命中关键词包成 `<mark>`，用于搜索结果的标题与摘要高亮。
 *
 * 口径：
 *   - 关键词按空白拆分，多个词一起高亮（`react hooks` → 两个词都标）；
 *   - 大小写不敏感（后端返回的摘要大小写不一定与输入一致）；
 *   - 关键词里的正则元字符全部转义，不会因为搜 `a.b` 之类的字符串把标题切碎。
 *
 * 返回的是节点数组，直接放进 JSX 即可（纯函数，服务端组件也能用）。
 */
export function highlightText(text: string, query: string): ReactNode {
    const keywords = query
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map(escapeRegExp);
    if (!text || keywords.length === 0) return text;

    const parts = text.split(new RegExp(`(${keywords.join("|")})`, "gi"));
    // split 带捕获组时，奇数下标就是命中的片段
    return parts.map((part, index) =>
        index % 2 === 1 ? (
            <mark key={index} className="rounded-sm bg-primary/20 px-0.5 text-inherit">
                {part}
            </mark>
        ) : (
            part
        )
    );
}
