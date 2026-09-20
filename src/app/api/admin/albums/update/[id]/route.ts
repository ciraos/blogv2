import type { NextRequest } from "next/server";

import { authedProxyFetch } from "@/lib/admin-api";

// 相册管理 · 更新单张图片：PUT /api/admin/albums/update/[id] → 远端 PUT /albums/update/:id
// 注意：远端 imageUrl 是必填，更新时要把原图地址一并带上。
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return Response.json({ code: 400, message: "请求体格式错误", data: null }, { status: 400 });
    }
    return authedProxyFetch(`/albums/update/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(body) });
}
