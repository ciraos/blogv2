import type { MetadataRoute } from "next";

const site_url = process.env.NEXT_PUBLIC_SITE_URL ?? "";

// robots 为静态内容，无需动态生成（站点 URL 来自环境变量）
export default function robots(): MetadataRoute.Robots {
    // 无站点 URL 时回退相对 sitemap 地址（生产环境 NEXT_PUBLIC_SITE_URL 恒有值）
    const base = site_url.replace(/\/+$/, "");

    return {
        rules: {
            userAgent: "*",
            allow: "/",
            // 后台管理与本应用同源代理接口不收录
            disallow: ["/admin", "/api"],
        },
        sitemap: `${base}/sitemap.xml`,
    };
}
