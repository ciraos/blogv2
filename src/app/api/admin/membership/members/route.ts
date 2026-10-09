import { NextRequest } from "next/server";
import { adminProxyFetch } from "@/lib/admin-api";

// 会员用户列表：转发远端 PRO 模块 /pro/admin/membership/members（官方 membership.ts L54-56）。
// 后端不开放 CORS 且需鉴权，浏览器端不能直连，由本路由读取 httpOnly cookie 中的 token 转发。
// 查询参数（page / page_size / status=active|expired）原样透传。
// 只读接口：远端没有「单条会员」端点（官方前端也只调了列表），所以这里不提供 [id] 子路由。

/** GET /api/admin/membership/members —— 会员列表（分页 + status 筛选） */
export async function GET(request: NextRequest) {
    const qs = request.nextUrl.searchParams.toString();
    return adminProxyFetch(`/pro/admin/membership/members${qs ? `?${qs}` : ""}`, { method: "GET" });
}
