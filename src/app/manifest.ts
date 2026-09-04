import type { MetadataRoute } from "next";

import { SiteConfigResponse } from "@/types/site-config";

const api_url = process.env.NEXT_PUBLIC_API_URL;
const site_url = process.env.NEXT_PUBLIC_SITE_URL ?? "";

/** 站点静态图标（后端返回相对路径时拼站点前缀） */
function asset(url?: string): string | undefined {
    if (!url) return undefined;
    return url.startsWith("http") ? url : `${site_url}${url}`;
}

// manifest 由站点配置驱动（fetch 属 request-time API，需动态生成）
export const dynamic = "force-dynamic";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
    let appName = "博客";
    let description = "";
    let icons: MetadataRoute.Manifest["icons"] = [];

    try {
        const res = await fetch(`${api_url}/public/site-config`);
        const data: SiteConfigResponse = await res.json();
        const cfg = data.data;
        appName = cfg.APP_NAME || appName;
        description = cfg.SITE_DESCRIPTION || cfg.SUB_TITLE || "";

        const logo192 = asset(cfg.LOGO_URL_192x192);
        const logo512 = asset(cfg.LOGO_URL_512x512);
        const logo = asset(cfg.LOGO_URL);
        const favicon = asset(cfg.ICON_URL);

        // 尺寸明确的 PNG 优先；无 192/512 时回退任意 logo / favicon
        if (logo192) {
            icons.push({ src: logo192, sizes: "192x192", type: "image/png" });
        }
        if (logo512) {
            icons.push({ src: logo512, sizes: "512x512", type: "image/png" });
        }
        if (!logo192 && !logo512) {
            const fallback = logo || favicon;
            if (fallback) {
                icons.push({ src: fallback, sizes: "any", type: "image/x-icon" });
            }
        }
    } catch {
        // 配置获取失败：回退 favicon，保证 manifest 仍可用
        icons = [{ src: "/favicon.ico", sizes: "any", type: "image/x-icon" }];
    }

    return {
        name: appName,
        short_name: appName,
        description,
        start_url: "/",
        display: "standalone",
        background_color: "#f4f4f4",
        theme_color: "#425aef",
        icons,
    };
}
