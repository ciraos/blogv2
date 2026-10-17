import type { NextConfig } from "next";
import fs from "node:fs";
import path from "node:path";
import createMDX from "@next/mdx";

const isDev = process.env.NODE_ENV === "development";

/**
 * 扫描 src/app，收集所有「字面量路由的第一段 URL」，构建时通过 env 注入给 src/proxy.ts。
 *
 * 用途：中间件判断某个路径是否可能是「后端自定义页面」（后台页面管理里建的页面）。
 * 只有不在这份名单里的路径才会去问后端 /public/pages/{path}，页面不存在时直接返回真 404。
 *
 * 为什么构建时生成而不是手写：手写名单一旦漏了新增路由，新页面会被误判成 404 —— 生成式
 * 永远与路由同步（中间件跑在 Edge 运行时，拿不到文件系统，所以只能构建时注入）。
 */
function collectStaticRouteSegments(appDir: string): string[] {
  const segments = new Set<string>();
  const walk = (dir: string, isRoot: boolean) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const name = entry.name;
      // 路由组 (blog)/(auth)：不占 URL 段，继续往下看
      if (/^\(.+\)$/.test(name)) {
        walk(path.join(dir, name), isRoot);
        continue;
      }
      // 动态段 [id]/[...slug]：不可能是自定义页面的字面量路径
      if (name.startsWith("[")) continue;
      if (isRoot) segments.add(name);
      walk(path.join(dir, name), false);
    }
  };
  walk(appDir, true);
  return [...segments].sort();
}

const staticRouteSegments = collectStaticRouteSegments(path.join(process.cwd(), "src", "app"));

/**
 * 扫描 src/app/admin，生成「后台已存在的路由」的正则表达式源码列表，构建时注入给 src/proxy.ts。
 *
 * 用途：中间件要判断某个 `/admin/...` 路径是不是一个真实存在的后台页面。
 * 不是的话 → rewrite 到 `/admin/not-found-view` 并**带上 404 状态码**
 * （纯靠 app/admin/[...rest]/page.tsx 兜底时，页面渲染得对但状态码永远是 200）。
 *
 * 规则：
 *   - 路由组 (x) 不占 URL 段；动态段 [id] → `[^/]+`；catch-all [...rest] **跳过**
 *     （它就是用来兜底的，把它算进来等于所有路径都「存在」）；
 *   - 只收「目录里有 page.tsx」的路径（有 route.ts 的 API 目录不算后台页面）。
 */
function collectAdminRouteRegexps(appDir: string): string[] {
  const sources: string[] = [];
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const walk = (dir: string, segments: string[]) => {
    if (fs.existsSync(path.join(dir, "page.tsx"))) {
      const src = segments.map((seg) => (seg.startsWith("[") ? "[^/]+" : escape(seg))).join("/");
      sources.push(src);
    }
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const name = entry.name;
      if (/^\(.+\)$/.test(name)) {
        walk(path.join(dir, name), segments);
        continue;
      }
      if (name.startsWith("[...")) continue; // 兜底路由不参与「是否存在」判定
      walk(path.join(dir, name), [...segments, name]);
    }
  };

  walk(path.join(appDir, "admin"), ["admin"]);
  return sources.sort();
}

const adminRouteRegexps = collectAdminRouteRegexps(path.join(process.cwd(), "src", "app"));


/**
 * 前端自己的版本号：以 package.json 的 version 为唯一来源，构建时注入给前后端代码。
 * 与后端程序版本（/api/version）和站点配置里的 APP_VERSION 无关，互不影响。
 * 浏览器端也会内联，所以在客户端组件里读 process.env.APP_VERSION 同样有效。
 */
const appVersion = (
  JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8")) as { version?: string }
).version ?? "0.0.0";

const nextConfig: NextConfig = {

  /* config options here */
  distDir: ".next",
  output: "standalone",
  pageExtensions: ["js", "jsx", "md", "mdx", "ts", "tsx"],
  reactCompiler: true,
  reactStrictMode: false,

  experimental: {
    // 启用 app/global-not-found.js 约定（本版仍是实验特性，默认 false，见
    // 为什么必须开：本项目没有根 src/app/layout.tsx，而是 4 个路由组各自渲染 <html>/<body>
    // （(blog) / (auth) / admin / music）。官方文档
    // node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/not-found.md:53-58
    // 写明：多个根布局时没有唯一 layout 可以组装全局 404，需要 global-not-found.js + 本开关。
    // 不开时 /_not-found 会去套一个随机根布局（实测挑中 (blog)），于是未匹配 URL 会渲染成
    // 「前台外壳 + 404 文案」。相关装配逻辑：
    // node_modules/next/dist/build/webpack/loaders/next-app-loader/index.js:243-253, 380-387

    // 插件安装包（后端允许 100MB）与配置导入都要经过 src/proxy.ts：Next 会为 proxy 克隆并缓冲请求体，
    // 默认只缓冲 10MB，且超限时**不报错**而是"只缓冲到上限"再记一条 warning —— 大文件会被静默截断成坏文件。
    // 所以按后端上限把缓冲提到 100MB。
    proxyClientMaxBodySize: "100mb",
  },

  // 供 src/proxy.ts 使用的「本站静态路由第一段」名单（构建时扫描 src/app 生成）
  env: {
    APP_STATIC_ROUTE_SEGMENTS: staticRouteSegments.join(","),
    // 后台已存在的路由正则（JSON 数组的「源码」，proxy 里再编译成 RegExp）：
    // 用来把 /admin/<乱写> 变成真 404，而不是让 [...rest] 兜底页以 200 渲染
    //
    // ⚠️ 改了这里的值，`pnpm dev` 必须**整进程重启**：Next 自带的「config 变更自动重启」
    //    不会重新注入 env（实测：自动重启后 proxy 里读到的是 undefined，全站差点被 404）。
    APP_ADMIN_ROUTE_REGEXPS: JSON.stringify(adminRouteRegexps),
    APP_VERSION: appVersion,
  },

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
        //
        // 但后端「文件直链」是例外：站点配置里存的就是站内相对路径
        // （USER_AVATAR / footer.socialBar.centerImg = /api/f/…，PRO 图片 = /api/pro/images/…），
        // 本应用没有 /api/f、/api/pro 路由，不代理的话会被 (blog)/[...slug] 兜底页接走，
        // 返回 HTML 导致图片挂掉，所以这两组必须代理。
        {
          source: "/api/f/:path*",
          destination: `${backendUrl}/api/f/:path*`,
        },
        {
          source: "/api/pro/images/:path*",
          destination: `${backendUrl}/api/pro/images/:path*`,
        },
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
