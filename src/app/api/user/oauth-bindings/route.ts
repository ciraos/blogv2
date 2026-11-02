import { authedProxyFetch } from "@/lib/admin-api";

// 用户中心 · 第三方账号绑定列表：GET /api/user/oauth-bindings → 远端 PRO /pro/oauth/bindings
// 社区版后端没有该路由（404），前端只在 PRO 环境显示入口。
export async function GET() {
    return authedProxyFetch("/pro/oauth/bindings", { method: "GET" });
}
