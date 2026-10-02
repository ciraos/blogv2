import type { NextRequest } from "next/server";

import { adminProxyFetch } from "@/lib/admin-api";

/**
 * POST /api/admin/articles/[id]/history/[version]/restore 回滚到指定版本。
 * 请求体可选 { change_note }（记录这次回滚的说明）。
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; version: string }> }) {
    const { id, version } = await params;
    const body = await request.text();
    return adminProxyFetch(`/articles/${encodeURIComponent(id)}/history/${encodeURIComponent(version)}/restore`, {
        method: "POST",
        body,
    });
}
