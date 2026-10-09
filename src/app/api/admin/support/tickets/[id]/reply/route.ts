import { NextRequest, NextResponse } from "next/server";
import { adminProxyFetch } from "@/lib/admin-api";

// 管理员回复工单：转发远端 PRO 模块 /pro/admin/support/tickets/{id}/reply（官方 support.ts L34-36）。

type Params = Promise<{ id: string }>;

/** POST /api/admin/support/tickets/[id]/reply —— 回复工单（body: { content }） */
export async function POST(request: NextRequest, { params }: { params: Params }) {
    const { id } = await params;
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ code: 400, message: "请求体格式错误", data: null }, { status: 400 });
    }
    return adminProxyFetch(`/pro/admin/support/tickets/${encodeURIComponent(id)}/reply`, {
        method: "POST",
        body: JSON.stringify(body),
    });
}
