import { NextRequest } from "next/server";

import { adminProxyFetch } from "@/lib/admin-api";

// 知识库 · 单文档（PRO 模块）：
//   GET    /pro/admin/knowledge/documents/:id → 文档详情
//   DELETE /pro/admin/knowledge/documents/:id → 删除该文档及其分块
// 远端路径证据：官方前端快照 src/lib/api/knowledge.ts:35-45。
type Params = Promise<{ id: string }>;

export async function GET(_request: NextRequest, { params }: { params: Params }) {
    const { id } = await params;
    return adminProxyFetch(`/pro/admin/knowledge/documents/${encodeURIComponent(id)}`, { method: "GET" });
}

export async function DELETE(_request: NextRequest, { params }: { params: Params }) {
    const { id } = await params;
    return adminProxyFetch(`/pro/admin/knowledge/documents/${encodeURIComponent(id)}`, { method: "DELETE" });
}
