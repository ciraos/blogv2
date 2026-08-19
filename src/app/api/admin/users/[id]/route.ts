import { NextRequest, NextResponse } from "next/server";

import { adminProxyFetch } from "@/lib/admin-api";

type Params = Promise<{ id: string }>;

/** PUT /api/admin/users/[id] 管理员更新用户 */
export async function PUT(request: NextRequest, { params }: { params: Params }) {
    const { id } = await params;
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ code: 400, message: "请求体格式错误", data: null }, { status: 400 });
    }
    return adminProxyFetch(`/admin/users/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: JSON.stringify(body),
    });
}

/** DELETE /api/admin/users/[id] 管理员删除用户（软删除） */
export async function DELETE(_request: NextRequest, { params }: { params: Params }) {
    const { id } = await params;
    return adminProxyFetch(`/admin/users/${encodeURIComponent(id)}`, { method: "DELETE" });
}
