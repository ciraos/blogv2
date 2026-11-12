/**
 * 文章列表展示用的两个小工具：日期格式与摘要纯文本化。
 *
 * 首页头条和列表行都要用，放这里一份，避免两处各写一遍、日后慢慢走样。
 */

/** yyyy.MM.dd —— 编辑部风列表的日期列用等宽数字，不做本地化长格式 */
export function formatPostDate(iso?: string | null): string {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

/** 后端摘要有时带着 MDX 记号（行首 `#`、`**粗体**`、反引号、列表符号），
 *  直接塞进 line-clamp 会把记号当正文露出来（首页曾出现「# 在服务器上部署…」）。
 *  这里只剥记号，不改写任何文字。 */
export function toPlainSummary(text?: string | null): string {
    return (text ?? "")
        .replace(/```[\s\S]*?```/g, " ")
        .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
        .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/(^|\s)#{1,6}\s+/g, "$1")
        .replace(/^>\s?/gm, "")
        .replace(/^\s*[-*+]\s+/gm, "")
        .replace(/(\*\*|__|~~|`)/g, "")
        .replace(/\s+/g, " ")
        .trim();
}
