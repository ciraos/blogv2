import { cache } from "react";

import type { SiteConfig, SiteConfigResponse } from "@/types/site-config";

const api_url = process.env.NEXT_PUBLIC_API_URL;

/**
 * 判断是不是 Next 抛的「这条路由必须是动态的」信号（DYNAMIC_SERVER_USAGE）。
 *
 * 为什么必须单独识别、并且**原样抛出去**：`getSiteConfigs()` 为了「后台改配置前台立刻生效」
 * 用了 `cache: "no-store"`，Next 在构建期预渲染页面（如 /activate、/login）时会抛这个错。
 * 如果像普通网络错误一样 catch 掉，Next 就收不到「这页得动态渲染」的信号，
 * 于是拿 undefined 的配置去把页面**预渲染成静态产物**（图标/皮肤全错），
 * 还会在日志里刷一条 `[site-config] 读取站点配置失败：Dynamic server usage ...`。
 * 实测就是线上容器里出现的那条报错。
 */
function isDynamicServerUsage(error: unknown): boolean {
    return typeof error === "object" && error !== null && (error as { digest?: string }).digest === "DYNAMIC_SERVER_USAGE";
}

/**
 * 拉取后端站点总配置（`GET /public/site-config`）。
 *
 * 这是**唯一**的实现：此前 (blog)/layout、(admin)/layout、(auth)/layout、essay 页、app-sidebar
 * 各抄了一份，一次页面渲染最多打 3~4 次同一个接口（layout + generateMetadata + 页面 + 侧边栏）。
 *
 * 用 React 的 `cache()` 做**同一次渲染内**的去重（RSC 的 cache 作用域是一个请求），
 * 不加 `revalidate`/`fetch` 缓存 —— 后台改配置后前台要立刻生效，
 * 跨请求缓存会让「保存了但前台还是旧的」这种问题冒出来；
 * 需要长时间缓存时再加显式的 revalidate，不要在这里偷偷加。
 *
 * 失败时返回 undefined（并打日志）：调用方全部用可选链取值，不会因为配置接口抖动把整页打成 500。
 * **唯一例外**是 DynamicServerUsage —— 它必须往上抛（见 isDynamicServerUsage 的注释）。
 */
export const getSiteConfigs = cache(async (): Promise<SiteConfig | undefined> => {
    try {
        const res = await fetch(`${api_url}/public/site-config`, { cache: "no-store" });
        if (!res.ok) throw new Error(`获取站点配置失败：HTTP ${res.status}`);
        const data = (await res.json()) as SiteConfigResponse;
        return data.data;
    } catch (error) {
        if (isDynamicServerUsage(error)) throw error;
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
