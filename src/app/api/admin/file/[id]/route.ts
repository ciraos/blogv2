import type { NextRequest } from "next/server";

import { authedProxyFetch } from "@/lib/admin-api";

// 文件管理 · 文件/目录详情：GET /api/admin/file/[id] → 远端 GET /file/:id
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return authedProxyFetch(`/file/${encodeURIComponent(id)}`, { method: "GET" });
}
