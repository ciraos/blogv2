import { NextRequest, NextResponse } from "next/server";

import { adminProxyFetch } from "@/lib/admin-api";

type Params = Promise<{ id: string }>;

/** POST /api/admin/users/[id]/reset-password 管理员重置用户密码 */
export async function POST(request: NextRequest, { params }: { params: Params }) {
    const { id } = await params;
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ code: 400, message: "请求体格式错误", data: null }, { status: 400 });
    }
    return adminProxyFetch(`/admin/users/${encodeURIComponent(id)}/reset-password`, {
        method: "POST",
        body: JSON.stringify(body),
    });
}
