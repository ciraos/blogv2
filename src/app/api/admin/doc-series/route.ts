import { NextRequest } from "next/server";
import { adminProxyFetch } from "@/lib/admin-api";

// 文档系列列表：GET 转发到远端 /doc-series（需登录）。
// 后端不开放 CORS 且需鉴权，浏览器端不能直连，由本路由读取 httpOnly cookie 中的 token 转发。
// 查询参数（page / pageSize / keyword）原样透传。
export async function GET(request: NextRequest) {
    const qs = request.nextUrl.searchParams.toString();
    return adminProxyFetch(`/doc-series${qs ? `?${qs}` : ""}`, { method: "GET" });
}
