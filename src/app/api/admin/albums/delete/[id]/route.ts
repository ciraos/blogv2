import type { NextRequest } from "next/server";

import { authedProxyFetch } from "@/lib/admin-api";

// 相册管理 · 删除单张图片：DELETE /api/admin/albums/delete/[id] → 远端 DELETE /albums/delete/:id
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return authedProxyFetch(`/albums/delete/${encodeURIComponent(id)}`, { method: "DELETE" });
}
