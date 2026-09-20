import type { NextRequest } from "next/server";

import { authedProxyFetch } from "@/lib/admin-api";

// 相册分类管理 · 列表 / 新建
//   GET  /api/admin/album-categories → 远端 GET /album-categories（返回 AlbumCategoryDTO[]）
//   POST /api/admin/album-categories → 远端 POST /album-categories（body: name 必填 / description / displayOrder）
export async function GET() {
    return authedProxyFetch("/album-categories", { method: "GET" });
}

export async function POST(request: NextRequest) {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return Response.json({ code: 400, message: "请求体格式错误", data: null }, { status: 400 });
    }
    return authedProxyFetch("/album-categories", { method: "POST", body: JSON.stringify(body) });
}
