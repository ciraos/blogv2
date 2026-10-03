import { NextRequest } from "next/server";
import { adminProxyFetch } from "@/lib/admin-api";

// 存储策略列表：GET 转发到远端 /storage-policies（需登录）。
// 后端不开放 CORS 且需鉴权，浏览器端不能直连，由本路由读取 httpOnly cookie 中的 token 转发。
// 响应形状 { list, total }（无分页）；本轮只做列表查询，增删改后续再补。
export async function GET(request: NextRequest) {
    const qs = request.nextUrl.searchParams.toString();
    return adminProxyFetch(`/storage-policies${qs ? `?${qs}` : ""}`, { method: "GET" });
}
