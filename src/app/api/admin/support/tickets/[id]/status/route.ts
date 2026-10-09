import { NextRequest, NextResponse } from "next/server";
import { adminProxyFetch } from "@/lib/admin-api";

// 更新工单状态：转发远端 PRO 模块 /pro/admin/support/tickets/{id}/status（官方 support.ts L48-50）。
// 官方前端提交的是 PUT + { status }。

type Params = Promise<{ id: string }>;

/** PUT /api/admin/support/tickets/[id]/status —— 更新工单状态（body: { status }） */
export async function PUT(request: NextRequest, { params }: { params: Params }) {
    const { id } = await params;
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ code: 400, message: "请求体格式错误", data: null }, { status: 400 });
    }
    return adminProxyFetch(`/pro/admin/support/tickets/${encodeURIComponent(id)}/status`, {
        method: "PUT",
        body: JSON.stringify(body),
    });
}
