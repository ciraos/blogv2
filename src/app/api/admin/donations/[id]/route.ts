import { NextRequest, NextResponse } from "next/server";
import { adminProxyFetch } from "@/lib/admin-api";

type Params = Promise<{ id: string }>;

/** GET /api/admin/donations/[id] 管理员获取单条打赏记录（转发远端 /pro/admin/donations/{id}） */
export async function GET(_request: NextRequest, { params }: { params: Params }) {
    const { id } = await params;
    return adminProxyFetch(`/pro/admin/donations/${encodeURIComponent(id)}`, { method: "GET" });
}

/** PUT /api/admin/donations/[id] 管理员更新打赏记录（转发远端 /pro/admin/donations/{id}） */
export async function PUT(request: NextRequest, { params }: { params: Params }) {
    const { id } = await params;
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ code: 400, message: "请求体格式错误", data: null }, { status: 400 });
    }
    return adminProxyFetch(`/pro/admin/donations/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: JSON.stringify(body),
    });
}

/** DELETE /api/admin/donations/[id] 管理员删除打赏记录（转发远端 /pro/admin/donations/{id}） */
export async function DELETE(_request: NextRequest, { params }: { params: Params }) {
    const { id } = await params;
    return adminProxyFetch(`/pro/admin/donations/${encodeURIComponent(id)}`, { method: "DELETE" });
}
