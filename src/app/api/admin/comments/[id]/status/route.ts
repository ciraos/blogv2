import { NextRequest, NextResponse } from "next/server";
import { adminProxyFetch } from "@/lib/admin-api";

type Params = Promise<{ id: string }>;

/** PUT /api/admin/comments/[id]/status 管理员更新评论状态（1=已发布 2=待审核，转发远端 /comments/{id}/status） */
export async function PUT(request: NextRequest, { params }: { params: Params }) {
    const { id } = await params;
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ code: 400, message: "请求体格式错误", data: null }, { status: 400 });
    }
    return adminProxyFetch(`/comments/${encodeURIComponent(id)}/status`, {
        method: "PUT",
        body: JSON.stringify(body),
    });
}
