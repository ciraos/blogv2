import type { NextRequest } from "next/server";

import { adminProxyFetch } from "@/lib/admin-api";

/**
 * GET /api/admin/articles/[id]/history 文章历史版本列表（透传 page / pageSize）。
 * 复用 authedProxyFetch：读 httpOnly token cookie、带 Bearer 转发、统一 401/502 处理。
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const { search } = new URL(request.url);
    return adminProxyFetch(`/articles/${encodeURIComponent(id)}/history${search}`, { method: "GET" });
}
