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

/**
 * 文章发布至今的天数（用于「内容可能已过时」提示；时间解析失败返回 0）。
 * 放在组件外：服务端组件在 render 里直接调 `Date.now()` 会被 react-hooks/purity 拦下。
 */
export function daysSincePublished(iso?: string | null): number {
    if (!iso) return 0;
    const published = new Date(iso).getTime();
    if (Number.isNaN(published)) return 0;
    return Math.floor((Date.now() - published) / 86_400_000);
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
 * 内置默认封面（public/default-cover-v2.png：编辑部纸感 + 细线框 + 抽象几何标记）。
 *
 * 刻意**不含任何文字/站名** —— 这个主题会被别人装到自己的站点上，
 * 兜底封面一旦写死「葱苓小筑」，别人的站也会跟着显示成我们的站名。
 *
 * 为什么文件名带 `-v2`：封面图形换过一版（旧的带站名，新的纯几何）。
 * next/image 优化器、浏览器、CDN 都按 **URL** 做缓存，同名文件换不掉旧图；
 * 又不能加 `?v=2` 查询串 —— 本项目 `images.localPatterns` 只允许 `search: ""`，
 * next/image 会直接报 "using a query string which is not configured in images.localPatterns"。
 * 所以图形再改版时，**换个文件名**是最稳的缓存失效方式。
 *
 * 取值优先级：文章封面 → 文章顶图 → 站点设置的默认封面（post.default.cover）→ 这张内置图。
 * 也就是说**任何一篇文章都会有封面**，不会再出现「有的行有图、有的行没有」的参差。
 */
export const DEFAULT_POST_COVER = "/default-cover-v2.png";

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
