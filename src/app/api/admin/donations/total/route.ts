import { NextResponse } from "next/server";
import { adminProxyFetch } from "@/lib/admin-api";

// 打赏总额：转发到远端 /pro/donations/total。
// 注意这条远端其实是公开接口（无需登录），但管理端要用，仍走同源代理：
// 浏览器端不能直连后端（后端不开放 CORS）。
//
// 路径优先级：静态段 total 优先于同级的动态段 [id]，
// 所以 /api/admin/donations/total 不会被当成 id=total 的单条记录查询吃掉。
export async function GET() {
    return adminProxyFetch("/pro/donations/total", { method: "GET" });
}

/** 兜底：只读接口，其它方法明确拒绝（避免落到 [id] 路由产生误导性的响应） */
export async function POST() {
    return NextResponse.json({ code: 405, message: "方法不允许", data: null }, { status: 405 });
}
