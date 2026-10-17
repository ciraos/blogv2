import { authedProxyFetch } from "@/lib/admin-api"

// 管理员友链健康检查：POST 转发到远端 /links/health-check（触发后台执行，需登录）。
// 纯 JSON 透传，统一走 authedProxyFetch（读 cookie → Bearer → 统一 {code,message,data} 信封）。
export async function POST() {
    return authedProxyFetch("/links/health-check", { method: "POST" })
}
