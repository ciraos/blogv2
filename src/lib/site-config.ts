import { cache } from "react";

import { SITE_CONFIG_TAG } from "@/lib/api";
import type { SiteConfig, SiteConfigResponse } from "@/types/site-config";

const api_url = process.env.NEXT_PUBLIC_API_URL;

/**
 * 判断是不是 Next 抛的「这条路由必须是动态的」信号（DYNAMIC_SERVER_USAGE）。
 *
 * 为什么必须单独识别、并且**原样抛出去**：Next 在构建期预渲染页面（如 /activate、/login）时
 * 会抛这个错。如果像普通网络错误一样 catch 掉，Next 就收不到「这页得动态渲染」的信号，
 * 于是拿 undefined 的配置去把页面**预渲染成静态产物**（图标/皮肤全错），
 * 还会在日志里刷一条 `[site-config] 读取站点配置失败：Dynamic server usage ...`。
 * 实测就是线上容器里出现过的那条报错。
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
 * 缓存策略（两层）：
 *   1. React `cache()`：**同一次渲染**内多次调用只真正执行一次；
 *   2. Next 数据缓存：`next: { revalidate: 60, tags: ["site-config"] }` —— 跨请求复用 60 秒，
 *      后台「系统设置」保存成功后调 `revalidateTag("site-config", { expire: 0 })` 立刻失效，
 *      所以「改了配置前台马上变」依然成立，60 秒只是兜底上限。
 *
 * 为什么不能再 no-store：本站每页都要读它，no-store 等于每次访问白打一次后端，
 * 且让整棵 (blog) 树永远命中不了任何缓存（本次 #6 做数据缓存的直接原因）。
 *
 * 失败时返回 undefined（并打日志）：调用方全部用可选链取值，不会因为配置接口抖动把整页打成 500。
 * **唯一例外**是 DynamicServerUsage —— 它必须往上抛。
 */
export const getSiteConfigs = cache(async (): Promise<SiteConfig | undefined> => {
    try {
        const res = await fetch(`${api_url}/public/site-config`, {
            // 开发环境不缓存：后台改完配置想立刻在前台看到，否则要等 60 秒（还可能先拿到旧值）
            next: {
                revalidate: process.env.NODE_ENV === "development" ? 0 : 60,
                tags: [SITE_CONFIG_TAG],
            },
        });
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
