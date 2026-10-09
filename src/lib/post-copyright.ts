/**
 * 文章版权文案渲染（版权块模板 + 复制追加文案）。
 *
 * 口径来源：官方主题 scripts/theme/theme-anheyu-next-main
 *  - 版权块：src/components/post/PostCopyright/index.tsx 第 98-139 行
 *  - 复制追加：src/components/post/PostContent/index.tsx 第 45-111 行
 *  - 占位符说明面板：src/components/admin/settings/PostSettingsForm.tsx 第 247-273、409-450 行
 *
 * 占位符清单（官方 = 后台说明面板里列出的那几个，替换用全局 replace）：
 *  - post.copyright.original_template          → {license} {licenseUrl} {author} {siteUrl}
 *  - post.copyright.reprint_template_with_url  → {originalAuthor} {originalUrl}
 *  - post.copyright.reprint_template_without_url → {originalAuthor}
 *  - post.copy.copyright_original              → {siteName} {author} {url}
 *  - post.copy.copyright_reprint               → {originalAuthor} {originalUrl} {currentUrl}
 *
 * 版权块模板本身是 HTML（官方后台就是 code 编辑器 + dangerouslySetInnerHTML 渲染），
 * 所以这里只做纯字符串替换，不做转义，与官方保持一致。
 */

/** 官方默认版权模板：后台留空时用它兜底（即现有页面写死的文案） */
export const DEFAULT_COPYRIGHT_TEMPLATE_ORIGINAL =
    '本文是原创文章，采用 <a href="{licenseUrl}" target="_blank">{license}</a> 协议，完整转载请注明来自 <a href="{siteUrl}" target="_blank">{author}</a>';

export const DEFAULT_COPYRIGHT_TEMPLATE_REPRINT_WITH_URL =
    '本文是转载或翻译文章，版权归 <a href="{originalUrl}" target="_blank">{originalAuthor}</a> 所有。建议访问原文，转载本文请联系原作者。';

export const DEFAULT_COPYRIGHT_TEMPLATE_REPRINT_WITHOUT_URL =
    "本文是转载或翻译文章，版权归 {originalAuthor} 所有。建议访问原文，转载本文请联系原作者。";

/** 官方默认复制追加文案（PostContent/index.tsx 第 86、95 行） */
export const DEFAULT_COPY_TEMPLATE_ORIGINAL =
    "本文来自 {siteName}，作者 {author}，转载请注明出处。\n原文地址：{url}";

export const DEFAULT_COPY_TEMPLATE_REPRINT =
    "本文转载自 {originalAuthor}，原文地址：{originalUrl}\n当前页面：{currentUrl}";

/**
 * 协议文案/链接：官方取自 siteConfig.copyright?.license（我们的 SiteConfig 没有这两个键），
 * 因此固定用官方兜底值，与现有页面写死的 CC BY-NC-SA 4.0 一致。
 */
export const COPYRIGHT_LICENSE = "CC BY-NC-SA 4.0";
export const COPYRIGHT_LICENSE_URL = "https://creativecommons.org/licenses/by-nc-sa/4.0/";

export interface CopyrightTemplateInput {
    /** post.copyright.original_template */
    originalTemplate?: string | null;
    /** post.copyright.reprint_template_with_url */
    reprintTemplateWithUrl?: string | null;
    /** post.copyright.reprint_template_without_url */
    reprintTemplateWithoutUrl?: string | null;
    /** 是否转载文章（article.is_reprint） */
    isReprint: boolean;
    /** 原作者（article.copyright_author，空则回退作者本人） */
    copyrightAuthor?: string | null;
    /** 原文链接（article.copyright_url） */
    copyrightUrl?: string | null;
    /** 作者：article.owner_nickname || 站点名 */
    author: string;
    /** 站点链接：SITE_URL */
    siteUrl: string;
}

/**
 * 渲染文章底部版权块的 HTML。
 * 判断分支与官方一致：转载且有原链 → with_url；转载无原链 → without_url；否则原创模板。
 */
export function renderCopyrightHtml(input: CopyrightTemplateInput): string {
    const author = input.author || "本站博主";
    const siteUrl = input.siteUrl || "/";
    const originalUrl = (input.copyrightUrl ?? "").trim();
    const originalAuthor = (input.copyrightAuthor ?? "").trim() || author;

    if (input.isReprint) {
        if (originalUrl) {
            const template =
                (input.reprintTemplateWithUrl ?? "").trim() || DEFAULT_COPYRIGHT_TEMPLATE_REPRINT_WITH_URL;
            return template
                .replace(/{originalAuthor}/g, originalAuthor)
                .replace(/{originalUrl}/g, originalUrl);
        }
        const template =
            (input.reprintTemplateWithoutUrl ?? "").trim() || DEFAULT_COPYRIGHT_TEMPLATE_REPRINT_WITHOUT_URL;
        return template.replace(/{originalAuthor}/g, originalAuthor);
    }

    const template = (input.originalTemplate ?? "").trim() || DEFAULT_COPYRIGHT_TEMPLATE_ORIGINAL;
    return template
        .replace(/{licenseUrl}/g, COPYRIGHT_LICENSE_URL)
        .replace(/{license}/g, COPYRIGHT_LICENSE)
        .replace(/{siteUrl}/g, siteUrl)
        .replace(/{author}/g, author);
}

export interface CopyTemplateInput {
    /** post.copy.copyright_original */
    copyrightOriginal?: string | null;
    /** post.copy.copyright_reprint */
    copyrightReprint?: string | null;
    /** 是否转载文章 */
    isReprint: boolean;
    /** 原作者（转载时用） */
    copyrightAuthor?: string | null;
    /** 原文链接（转载时用） */
    copyrightUrl?: string | null;
    /** 站点名称 APP_NAME */
    siteName: string;
    /** 作者：frontDesk.siteOwner.name（官方口径，不是文章作者） */
    author: string;
    /** 当前页面地址（window.location.href） */
    currentUrl: string;
}

/**
 * 复制追加版权所需的服务端上下文（文章页服务端组装后传给客户端 ArticleBody）。
 * 「当前页面地址」这类只有浏览器知道的值留在客户端补。
 */
export interface ArticleCopyCopyrightConfig {
    /** post.copy.enable：官方语义是「是否允许复制」，false = 禁止复制正文 */
    enable: boolean;
    /** post.copy.copyright_enable：是否在复制内容末尾追加版权声明 */
    copyrightEnable: boolean;
    /** post.copy.copyright_original */
    copyrightOriginal: string;
    /** post.copy.copyright_reprint */
    copyrightReprint: string;
    /** 站点名称 APP_NAME */
    siteName: string;
    /** 作者：frontDesk.siteOwner.name */
    author: string;
    /** 是否转载文章（决定用原创还是转载文案） */
    isReprint: boolean;
    /** 原作者（转载时用） */
    copyrightAuthor: string;
    /** 原文链接（转载时用） */
    copyrightUrl: string;
}

/**
 * 渲染「复制正文时追加」的纯文本版权声明。
 * 注意：{url} 与 {currentUrl} 官方都取 window.location.href，只能在客户端调用。
 */
export function renderCopyCopyrightText(input: CopyTemplateInput): string {
    if (input.isReprint) {
        const template = (input.copyrightReprint ?? "").trim() || DEFAULT_COPY_TEMPLATE_REPRINT;
        return template
            .replace(/{originalAuthor}/g, (input.copyrightAuthor ?? "").trim() || "原作者")
            .replace(/{originalUrl}/g, (input.copyrightUrl ?? "").trim())
            .replace(/{currentUrl}/g, input.currentUrl);
    }

    const template = (input.copyrightOriginal ?? "").trim() || DEFAULT_COPY_TEMPLATE_ORIGINAL;
    return template
        .replace(/{siteName}/g, input.siteName || "本站")
        .replace(/{author}/g, input.author || "博主")
        .replace(/{url}/g, input.currentUrl);
}
