import { cache } from "react";

import type { SiteConfig, SiteConfigResponse } from "@/types/site-config";

const api_url = process.env.NEXT_PUBLIC_API_URL;

/**
 * 拉取后端站点总配置（`GET /public/site-config`）。
 *
 * 这是**唯一**的实现：此前 (blog)/layout、(admin)/layout、essay 页、app-sidebar 各抄了一份，
 * 一次页面渲染最多打 3~4 次同一个接口（layout + generateMetadata + 页面 + 侧边栏）。
 *
 * 用 React 的 `cache()` 做**同一次渲染内**的去重（RSC 的 cache 作用域是一个请求），
 * 不加 `revalidate`/`fetch` 缓存 —— 后台改配置后前台要立刻生效，
 * 跨请求缓存会让「保存了但前台还是旧的」这种问题冒出来；
 * 需要长时间缓存时再加显式的 revalidate，不要在这里偷偷加。
 *
 * 失败时返回 undefined（并打日志）：调用方全部用可选链取值，不会因为配置接口抖动把整页打成 500。
 */
export const getSiteConfigs = cache(async (): Promise<SiteConfig | undefined> => {
    try {
        const res = await fetch(`${api_url}/public/site-config`, { cache: "no-store" });
        if (!res.ok) throw new Error(`获取站点配置失败：HTTP ${res.status}`);
        const data = (await res.json()) as SiteConfigResponse;
        return data.data;
    } catch (error) {
        console.error("[site-config] 读取站点配置失败：", error);
        return undefined;
    }
});

/**
 * 站点图标（favicon / apple-touch-icon）用的地址解析，三个 layout 的 generateMetadata 共用。
 * 取值链与后端字段一致：LOGO_URL_192x192 → LOGO_URL → ICON_URL；都取不到退回本地 favicon.ico。
 */
export function resolveSiteIcons(config?: SiteConfig): { icon: string; apple: string } {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
    const icon = config?.ICON_URL;
    const apple = config?.LOGO_URL_192x192 || config?.LOGO_URL || icon;
    return {
        icon: icon ? siteUrl + icon : "/favicon.ico",
        apple: apple ? siteUrl + apple : "/favicon.ico",
    };
}
