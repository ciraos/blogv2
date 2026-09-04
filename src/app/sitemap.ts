import type { MetadataRoute } from "next";

import { getAllPublicArticlesApi } from "@/lib/api";
import { SiteConfigResponse } from "@/types/site-config";

const api_url = process.env.NEXT_PUBLIC_API_URL;
const env_site_url = process.env.NEXT_PUBLIC_SITE_URL ?? "";

/** 前台静态路由（收录可公开访问的内容页；search/random-post 为动态/跳转页不入） */
interface StaticEntry {
    path: string;
    changeFrequency: "daily" | "weekly" | "monthly" | "yearly";
    priority: number;
}

const STATIC_ENTRIES: StaticEntry[] = [
    { path: "/", changeFrequency: "daily", priority: 1.0 },
    { path: "/posts", changeFrequency: "weekly", priority: 0.9 },
    { path: "/archives", changeFrequency: "weekly", priority: 0.7 },
    { path: "/tags", changeFrequency: "weekly", priority: 0.7 },
    { path: "/categories", changeFrequency: "weekly", priority: 0.7 },
    { path: "/link", changeFrequency: "weekly", priority: 0.6 },
    { path: "/about", changeFrequency: "monthly", priority: 0.5 },
    { path: "/album", changeFrequency: "monthly", priority: 0.5 },
    { path: "/music", changeFrequency: "monthly", priority: 0.5 },
    { path: "/essay", changeFrequency: "weekly", priority: 0.6 },
    { path: "/fcircle", changeFrequency: "weekly", priority: 0.5 },
    { path: "/recentcomments", changeFrequency: "weekly", priority: 0.5 },
    { path: "/equipment", changeFrequency: "monthly", priority: 0.4 },
    { path: "/travelling", changeFrequency: "monthly", priority: 0.4 },
    { path: "/air-conditioner", changeFrequency: "monthly", priority: 0.4 },
    { path: "/privacy", changeFrequency: "yearly", priority: 0.2 },
    { path: "/copyright", changeFrequency: "yearly", priority: 0.2 },
    { path: "/cookies", changeFrequency: "yearly", priority: 0.2 },
];

/** 站点主域名：优先环境变量，其次站点配置 SITE_URL，最后回退本机（保证 loc 为绝对地址） */
async function resolveSiteUrl(): Promise<string> {
    if (env_site_url) return env_site_url.replace(/\/+$/, "");
    try {
        const res = await fetch(`${api_url}/public/site-config`);
        const data: SiteConfigResponse = await res.json();
        const cfgUrl = data.data.SITE_URL;
        if (cfgUrl) return cfgUrl.replace(/\/+$/, "");
    } catch {
        // 配置获取失败：走回退
    }
    return "http://localhost:3000";
}

// sitemap 由站点配置与文章数据驱动（fetch 属 request-time API，需动态生成）
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const siteUrl = await resolveSiteUrl();

    const entries: MetadataRoute.Sitemap = STATIC_ENTRIES.map(({ path, changeFrequency, priority }) => ({
        url: `${siteUrl}${path}`,
        changeFrequency,
        priority,
    }));

    // 文章页 /posts/{id}（URL 段与前台列表一致，用文章公共 id）
    try {
        const articles = await getAllPublicArticlesApi();
        for (const article of articles) {
            entries.push({
                url: `${siteUrl}/posts/${article.id}`,
                lastModified: article.updated_at,
                changeFrequency: "weekly",
                priority: 0.8,
            });
        }
    } catch {
        // 文章拉取失败：仅返回静态路由，避免整个 sitemap 报错
    }

    return entries;
}
