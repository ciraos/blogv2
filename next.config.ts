import type { NextConfig } from "next";
import createMDX from "@next/mdx";

const isDev = process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {

  /* config options here */
  distDir: ".next",
  output: "standalone",
  pageExtensions: ["js", "jsx", "md", "mdx", "ts", "tsx"],
  reactCompiler: true,
  reactStrictMode: false,

  // 代理配置 - 客户端请求代理到 Go 后端
  async rewrites() {
    // 后端基址优先级：显式 BACKEND_URL/API_URL > 同源站点 NEXT_PUBLIC_SITE_URL > 通用兜底
    // （后端与站点同源时，只要 .env 设了站点地址即可，无需重复配后端地址）
    const backendUrl = isDev
      ? process.env.BACKEND_URL || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3126"
      : process.env.API_URL || process.env.NEXT_PUBLIC_SITE_URL || "http://anheyu:3126";

    return {
      // beforeFiles: 在检查 public 目录之前执行（API 等必须代理的路径）
      beforeFiles: [
        // 注意：/api/* 不在这里代理——它由本应用的 src/app/api/*/route.ts 同源路由处理
        // （服务端转发到远端并合并数据、返回统一形状；浏览器端不能直连后端）。
        // 若这里加 /api/:path* 会抢占路由，导致客户端拿到后端原始分页形状而渲染错乱。
        // 文件直链代理（后端路由在 /api/f/ 下，需带 /api 前缀）
        {
          source: "/f/:path*",
          destination: `${backendUrl}/api/f/:path*`,
        },
        // 缓存文件代理
        {
          source: "/needcache/:path*",
          destination: `${backendUrl}/needcache/:path*`,
        },
      ],
      // afterFiles: 先检查 public 目录，找不到才代理到 Go 后端
      // sitemap.xml / robots.txt 由 Next.js 元数据约定处理（src/app/sitemap.ts、robots.ts）
      // RSS Feed 由 Route Handler 处理（src/app/rss.xml/route.ts 等），运行时读取后端地址
      afterFiles: [
        // 静态文件代理（后端上传的图片等，优先使用 public 目录中的默认文件）
        {
          source: "/static/:path*",
          destination: `${backendUrl}/static/:path*`,
        },
      ],
      fallback: [],
    };
  },
};

const withMDX = createMDX({
  extension: /\.(md|mdx)$/,
  // options: { remarkPlugins: [remarkGfm], }
});

export default withMDX(nextConfig);
