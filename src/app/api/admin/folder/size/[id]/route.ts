import type { NextRequest } from "next/server";

import { authedProxyFetch } from "@/lib/admin-api";

// 文件管理 · 目录大小：GET /api/admin/folder/size/[id] → 远端 GET /folder/size/:id
// 返回 { logicalSize, storageConsumption, fileCount }
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return authedProxyFetch(`/folder/size/${encodeURIComponent(id)}`, { method: "GET" });
}
