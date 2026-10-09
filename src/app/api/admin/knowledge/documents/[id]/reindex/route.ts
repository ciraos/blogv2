import { NextRequest } from "next/server";

import { adminProxyFetch } from "@/lib/admin-api";

// 知识库 · 单文档重建索引：POST /api/admin/knowledge/documents/:id/reindex
// → 远端 POST /pro/admin/knowledge/documents/:id/reindex（官方前端 knowledge.ts:55-57）
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return adminProxyFetch(`/pro/admin/knowledge/documents/${encodeURIComponent(id)}/reindex`, { method: "POST" });
}
