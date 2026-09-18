import { NextRequest, NextResponse } from "next/server";
import { adminProxyFetch } from "@/lib/admin-api";

type Params = Promise<{ id: string }>;

/** PUT /api/admin/comments/[id]/info 管理员更新评论信息（内容/昵称/邮箱/网站，转发远端 /comments/{id}/info） */
export async function PUT(request: NextRequest, { params }: { params: Params }) {
    const { id } = await params;
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ code: 400, message: "请求体格式错误", data: null }, { status: 400 });
    }
    return adminProxyFetch(`/comments/${encodeURIComponent(id)}/info`, {
        method: "PUT",
        body: JSON.stringify(body),
    });
}
