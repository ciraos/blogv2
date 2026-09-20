import type { NextRequest } from "next/server";

import { authedProxyFetch } from "@/lib/admin-api";

// 文件管理 · 缩略图签名：GET /api/admin/thumbnail/[id] → 远端 GET /thumbnail/:publicID
// 返回 { sign, expires, obfuscated }，拿 sign 去 /api/t/:sign 取图（该路径公开，不需要 token）。
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return authedProxyFetch(`/thumbnail/${encodeURIComponent(id)}`, { method: "GET" });
}
