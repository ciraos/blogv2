import { NextRequest, NextResponse } from "next/server";

import { adminProxyFetch } from "@/lib/admin-api";

type Params = Promise<{ id: string }>;

/** PUT /api/admin/users/[id]/status 管理员更新用户状态（1:正常 2:未激活 3:已封禁） */
export async function PUT(request: NextRequest, { params }: { params: Params }) {
    const { id } = await params;
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ code: 400, message: "请求体格式错误", data: null }, { status: 400 });
    }
    return adminProxyFetch(`/admin/users/${encodeURIComponent(id)}/status`, {
        method: "PUT",
        body: JSON.stringify(body),
    });
}
