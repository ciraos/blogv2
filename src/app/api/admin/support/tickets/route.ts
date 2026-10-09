import { NextRequest } from "next/server";
import { adminProxyFetch } from "@/lib/admin-api";

// 工单列表：转发远端 PRO 模块 /pro/admin/support/tickets（官方 support.ts L20-22）。
// 后端不开放 CORS 且需鉴权，浏览器端不能直连，由本路由读取 httpOnly cookie 中的 token 转发。
// 查询参数（page / page_size / status / type / keyword）原样透传。

/** GET /api/admin/support/tickets —— 工单列表（分页 + 状态/类型/关键词筛选） */
export async function GET(request: NextRequest) {
    const qs = request.nextUrl.searchParams.toString();
    return adminProxyFetch(`/pro/admin/support/tickets${qs ? `?${qs}` : ""}`, { method: "GET" });
}
