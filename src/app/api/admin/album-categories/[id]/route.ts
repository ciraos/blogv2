import type { NextRequest } from "next/server";

import { authedProxyFetch } from "@/lib/admin-api";

// 相册分类管理 · 单个分类：GET / PUT / DELETE /api/admin/album-categories/[id] → 远端 /album-categories/:id
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return authedProxyFetch(`/album-categories/${encodeURIComponent(id)}`, { method: "GET" });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return Response.json({ code: 400, message: "请求体格式错误", data: null }, { status: 400 });
    }
    return authedProxyFetch(`/album-categories/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(body) });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return authedProxyFetch(`/album-categories/${encodeURIComponent(id)}`, { method: "DELETE" });
}
