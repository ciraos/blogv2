import { NextRequest, NextResponse } from "next/server";
import { adminProxyFetch } from "@/lib/admin-api";

// 会员套餐单条：转发远端 PRO 模块 /pro/admin/membership/plans/{id}（官方 membership.ts L26-28、L40-42、L47-49）。

type Params = Promise<{ id: string }>;

/** GET /api/admin/membership/plans/[id] —— 套餐详情 */
export async function GET(_request: NextRequest, { params }: { params: Params }) {
    const { id } = await params;
    return adminProxyFetch(`/pro/admin/membership/plans/${encodeURIComponent(id)}`, { method: "GET" });
}

/** PUT /api/admin/membership/plans/[id] —— 更新套餐（字段全部可选，切状态 / 改排序也走它） */
export async function PUT(request: NextRequest, { params }: { params: Params }) {
    const { id } = await params;
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ code: 400, message: "请求体格式错误", data: null }, { status: 400 });
    }
    return adminProxyFetch(`/pro/admin/membership/plans/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: JSON.stringify(body),
    });
}

/** DELETE /api/admin/membership/plans/[id] —— 删除套餐 */
export async function DELETE(_request: NextRequest, { params }: { params: Params }) {
    const { id } = await params;
    return adminProxyFetch(`/pro/admin/membership/plans/${encodeURIComponent(id)}`, { method: "DELETE" });
}
