// 博客前台页面共享的 Metadata 生成（基于站点配置）
import type { Metadata } from "next";

import { resolveAssetUrl } from "@/lib/utils";
import { SiteConfigResponse } from "@/types/site-config";

const api_url = process.env.NEXT_PUBLIC_API_URL;

/** 关键词拆分：兼容中/英文逗号、分号与空白，去空项 */
export function splitKeywords(kw?: string | null): string[] {
    if (!kw) return [];
    return kw
        .split(/[,，;；\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
}

/** 生成统一的站点 metadata；titleSuffix 为空时使用「站名 - 副标题」 */
export async function generateBlogMetadata(titleSuffix?: string): Promise<Metadata> {
    try {
        const res = await fetch(`${api_url}/public/site-config`);
        const data: SiteConfigResponse = await res.json();
        const appName = data.data.APP_NAME;
        const subTitle = data.data.SUB_TITLE;
        const fullTitle = titleSuffix ? `${appName} - ${titleSuffix}` : `${appName} - ${subTitle}`;
        // 分享默认图：优先 512 logo，其次主 logo / 站点图标（相对路径拼站点前缀成绝对地址）
        const ogImage = resolveAssetUrl(data.data.LOGO_URL_512x512 || data.data.LOGO_URL || data.data.ICON_URL);
        // 站点关键词（site-config SITE_KEYWORDS，中/英文逗号分隔）
        const keywords = splitKeywords(data.data.SITE_KEYWORDS);
        return {
            title: fullTitle,
            description: subTitle,
            keywords,
            openGraph: {
                type: "website",
                siteName: appName,
                title: fullTitle,
                description: subTitle,
                locale: "zh_CN",
                ...(ogImage ? { images: [{ url: ogImage }] } : {}),
            },
            twitter: {
                card: "summary_large_image",
                title: fullTitle,
                description: subTitle,
                ...(ogImage ? { images: [ogImage] } : {}),
            },
        };
    } catch {
        return { title: titleSuffix };
    }
}
