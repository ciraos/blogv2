import { resolveAssetUrl } from "@/lib/utils";

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

/**
 * 内置默认封面（public/default-cover.png，编辑部风的纸面 + 站名）。
 *
 * 取值优先级：文章封面 → 文章顶图 → 站点设置的默认封面（post.default.cover）→ 这张内置图。
 * 也就是说**任何一篇文章都会有封面**，不会再出现「有的行有图、有的行没有」的参差。
 */
export const DEFAULT_POST_COVER = "/default-cover.png";

/**
 * 解析一篇文章最终使用的封面地址（**已解析过域名**，调用方不要再套 resolveAssetUrl）。
 *
 * 注意内置默认封面是本站 public 下的文件，不能走 resolveAssetUrl ——
 * 那个函数会给相对路径拼上「后端站点域名」，而这张图只存在于 Next 自己的 /public。
 */
export function resolvePostCover(
    article: { cover_url?: string | null; top_img_url?: string | null },
    siteDefaultCover?: string | null
): string {
    const own = article.cover_url || article.top_img_url;
    if (own) return resolveAssetUrl(own) ?? DEFAULT_POST_COVER;

    const siteDefault = resolveAssetUrl(siteDefaultCover);
    if (siteDefault) return siteDefault;

    return DEFAULT_POST_COVER;
}
