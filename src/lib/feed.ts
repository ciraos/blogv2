// 订阅源（RSS 2.0 / Atom）共享逻辑：站点信息 + 文章数据 + XML 工具函数
import { getAllPublicArticlesApi } from "@/lib/api";
import { SiteConfigResponse } from "@/types/site-config";

const api_url = process.env.NEXT_PUBLIC_API_URL;
const env_site_url = process.env.NEXT_PUBLIC_SITE_URL ?? "";

/** 供 feed 使用的文章精简信息 */
export interface FeedArticle {
    id: string;
    title: string;
    link: string;
    /** 摘要（文章列表接口的 summaries 首段，可能为空） */
    summary: string;
    /** 发布时间（ISO8601，来自 created_at） */
    published: string;
    /** 更新时间（ISO8601，来自 updated_at） */
    updated: string;
}

export interface FeedData {
    name: string;
    description: string;
    siteUrl: string;
    /** 全部文章里最新的更新时间（供 lastBuildDate / <updated>，取最大值） */
    latestUpdated: string;
    /** 按发布时间倒序的文章（feed 惯例：最新发布在前） */
    articles: FeedArticle[];
}

/** 站点主域名：优先环境变量，其次站点配置 SITE_URL，最后回退本机（保证链接为绝对地址） */
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

/** 拉取站点名/描述与全部公开文章；单项失败时降级，不整体抛错 */
export async function getFeedData(): Promise<FeedData> {
    let name = "博客";
    let description = "";

    try {
        const res = await fetch(`${api_url}/public/site-config`);
        const data: SiteConfigResponse = await res.json();
        name = data.data.APP_NAME || name;
        description = data.data.SUB_TITLE || data.data.SITE_DESCRIPTION || "";
    } catch {
        // 配置获取失败：使用默认值
    }

    const siteUrl = await resolveSiteUrl();

    let articles: FeedArticle[] = [];
    try {
        const list = await getAllPublicArticlesApi();
        articles = list
            .map((a) => ({
                id: a.id,
                title: a.title,
                link: `${siteUrl}/posts/${a.id}`,
                summary: a.summaries?.[0] ?? "",
                published: a.created_at,
                updated: a.updated_at,
            }))
            // 后端按「置顶+创建时间」排序，feed 统一改为发布时间倒序
            .sort((a, b) => new Date(b.published).getTime() - new Date(a.published).getTime());
    } catch {
        // 文章拉取失败：输出空条目 feed，避免整页报错
    }

    // 站点级更新时间 = 全部文章 updated_at 的最大值（无文章时用当前时间）
    let latestUpdated = new Date().toISOString();
    if (articles.length > 0) {
        const max = articles.reduce((m, a) => Math.max(m, new Date(a.updated).getTime()), 0);
        latestUpdated = new Date(max).toISOString();
    }

    return { name, description, siteUrl, latestUpdated, articles };
}

/** XML 特殊字符转义（& 需最先替换，防止二次转义） */
export function escapeXml(text: string): string {
    return text.replace(/[&<>"']/g, (ch) => {
        switch (ch) {
            case "&":
                return "&amp;";
            case "<":
                return "&lt;";
            case ">":
                return "&gt;";
            case '"':
                return "&quot;";
            default:
                return "&apos;";
        }
    });
}

/** 转 RFC 822 时间（RSS pubDate，如 Fri, 28 Aug 2026 18:23:35 GMT） */
export function toRfc822(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toUTCString();
}

/** 转 ISO 8601 时间（Atom published/updated） */
export function toIso(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toISOString();
}
