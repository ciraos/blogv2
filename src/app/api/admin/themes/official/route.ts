import { NextRequest } from "next/server";
import { adminProxyFetch } from "@/lib/admin-api";

// 官方主题列表：GET 转发到远端 /theme/official（需登录）。
// 后端不开放 CORS 且需鉴权，浏览器端不能直连，由本路由读取 httpOnly cookie 中的 token 转发。
// 响应形状 { list, total }（无分页）。
export async function GET(request: NextRequest) {
    const qs = request.nextUrl.searchParams.toString();
    return adminProxyFetch(`/theme/official${qs ? `?${qs}` : ""}`, { method: "GET" });
}
