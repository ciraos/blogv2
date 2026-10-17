import { publicProxy } from "@/lib/public-proxy"

// GET /api/public/site-config：本站同源代理，服务端转发到远端 /public/site-config（公开，无需鉴权）。
// 后端不开放 CORS，浏览器端不能直连，需经本路由取得站点公开配置（如 comment.anonymous_email / blogger_email）。
// 注意：服务端组件读配置走 lib/site-config.ts（React cache 去重），不要绕这里。
export async function GET() {
    return publicProxy("/public/site-config", { method: "GET" })
}
