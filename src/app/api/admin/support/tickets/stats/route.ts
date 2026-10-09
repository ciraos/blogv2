import { NextResponse } from "next/server";
import { adminProxyFetch } from "@/lib/admin-api";

// 工单统计：转发远端 PRO 模块 /pro/admin/support/tickets/stats（官方 support.ts L62-63）。
//
// 路径优先级：静态段 stats 优先于同级的动态段 [id]，
// 所以 /api/admin/support/tickets/stats 不会被当成 id=stats 的详情查询吃掉
// （与 /api/admin/donations/total 同款约定）。

/** GET /api/admin/support/tickets/stats —— 工单统计（pending / processing / closed / total） */
export async function GET() {
    return adminProxyFetch("/pro/admin/support/tickets/stats", { method: "GET" });
}

/** 兜底：只读接口，其它方法明确拒绝（避免落到 [id] 路由产生误导性的响应） */
export async function POST() {
    return NextResponse.json({ code: 405, message: "方法不允许", data: null }, { status: 405 });
}
