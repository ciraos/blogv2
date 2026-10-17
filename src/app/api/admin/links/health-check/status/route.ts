import { authedProxyFetch } from "@/lib/admin-api"

// 管理员友链健康检查状态：GET 转发到远端 /links/health-check/status（需登录）。
// 触发健康检查后，前端据此轮询进度/结果。
export async function GET() {
    return authedProxyFetch("/links/health-check/status", { method: "GET" })
}
