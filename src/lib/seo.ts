// 博客前台页面共享的 Metadata 生成（基于站点配置）
import type { Metadata } from "next";

import { SiteConfigResponse } from "@/types/site-config";

const api_url = process.env.NEXT_PUBLIC_API_URL;

/** 生成统一的站点 metadata；titleSuffix 为空时使用「站名 - 副标题」 */
export async function generateBlogMetadata(titleSuffix?: string): Promise<Metadata> {
    try {
        const res = await fetch(`${api_url}/public/site-config`);
        const data: SiteConfigResponse = await res.json();
        const appName = data.data.APP_NAME;
        return {
            title: titleSuffix ? `${appName} - ${titleSuffix}` : `${appName} - ${data.data.SUB_TITLE}`,
            description: data.data.SUB_TITLE,
        };
    } catch {
        return { title: titleSuffix };
    }
}
