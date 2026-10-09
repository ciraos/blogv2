import { adminProxyFetch } from "@/lib/admin-api";

// 缓存状态：GET 转发到远端 /admin/cache/status（需登录）。
// 后端不开放 CORS 且要鉴权，浏览器端不能直连，由本路由读取 httpOnly cookie 中的 token 转发。
// 写法与 /api/admin/storage-policies 一致；本接口无查询参数，故不透传 querystring。
// 远端路由证据：scripts/anheyu/anheyu-app-main/cmd/server/cache_management.go:25
export async function GET() {
    return adminProxyFetch("/admin/cache/status", { method: "GET" });
}
