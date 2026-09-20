import type { NextRequest } from "next/server";

import { authedProxyFetch } from "@/lib/admin-api";

// 文件管理 · 目录树：GET /api/admin/folder/tree/[id] → 远端 GET /folder/tree/:id
// 用于「移动 / 复制」时选择目标文件夹（id 传目录的公共 ID）。
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return authedProxyFetch(`/folder/tree/${encodeURIComponent(id)}`, { method: "GET" });
}
