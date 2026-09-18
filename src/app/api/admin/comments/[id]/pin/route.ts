import { NextRequest, NextResponse } from "next/server";
import { adminProxyFetch } from "@/lib/admin-api";

type Params = Promise<{ id: string }>;

/** PUT /api/admin/comments/[id]/pin 管理员置顶/取消置顶评论（请求体 { pinned }，转发远端 /comments/{id}/pin） */
export async function PUT(request: NextRequest, { params }: { params: Params }) {
    const { id } = await params;
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ code: 400, message: "请求体格式错误", data: null }, { status: 400 });
    }
    return adminProxyFetch(`/comments/${encodeURIComponent(id)}/pin`, {
        method: "PUT",
        body: JSON.stringify(body),
    });
}
