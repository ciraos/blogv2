import type { NextRequest } from "next/server";

import { authedProxyFetch } from "@/lib/admin-api";

// 相册管理 · 批量删除：DELETE /api/admin/albums/batch-delete → 远端 DELETE /albums/batch-delete
// body: { ids: number[] }（远端要求 min=1；用 DELETE 带 body，代理原样转发）
export async function DELETE(request: NextRequest) {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return Response.json({ code: 400, message: "请求体格式错误", data: null }, { status: 400 });
    }
    return authedProxyFetch("/albums/batch-delete", { method: "DELETE", body: JSON.stringify(body) });
}
