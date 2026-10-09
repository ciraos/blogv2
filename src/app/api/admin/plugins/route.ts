import { NextRequest } from "next/server";
import { adminProxyFetch } from "@/lib/admin-api";

// 插件列表：GET 转发到远端 /admin/plugins（需登录 + 管理员）。
// 后端不开放 CORS 且需鉴权，浏览器端不能直连，由本路由读取 httpOnly cookie 中的 token 转发。
//
// 接口存在性证据：cmd/server/app.go:739 挂载 /api/admin/plugins（JWTAuth + AdminAuth）；
// 路由清单见 pkg/handler/plugin_admin/handler.go:189-196。线上无 token 直连返回 401。
//
// 响应形状：{ code, message, data: PluginInfo[] }（pkg/response/response.go:24-30 + registry.go:45-63），
// data 直接是数组（不是 { list, total }）；插件系统未初始化时 data 为 [] 且 message 给出提示。
export async function GET(request: NextRequest) {
    const qs = request.nextUrl.searchParams.toString();
    return adminProxyFetch(`/admin/plugins${qs ? `?${qs}` : ""}`, { method: "GET" });
}
