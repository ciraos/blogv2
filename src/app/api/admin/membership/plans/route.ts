import { NextRequest, NextResponse } from "next/server";
import { adminProxyFetch } from "@/lib/admin-api";

// 会员套餐列表 / 新增：转发远端 PRO 模块 /pro/admin/membership/plans（官方 membership.ts L19-21、L33-35）。
// 后端不开放 CORS 且需鉴权，浏览器端不能直连，由本路由读取 httpOnly cookie 中的 token 转发。

/** GET /api/admin/membership/plans —— 套餐列表（响应 { list }，无分页，查询参数原样透传） */
export async function GET(request: NextRequest) {
    const qs = request.nextUrl.searchParams.toString();
    return adminProxyFetch(`/pro/admin/membership/plans${qs ? `?${qs}` : ""}`, { method: "GET" });
}

/** POST /api/admin/membership/plans —— 新增套餐（body: CreatePlanRequest） */
export async function POST(request: NextRequest) {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ code: 400, message: "请求体格式错误", data: null }, { status: 400 });
    }
    return adminProxyFetch("/pro/admin/membership/plans", { method: "POST", body: JSON.stringify(body) });
}
