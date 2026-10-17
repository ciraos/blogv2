import type { NextRequest } from "next/server";

import { publicProxy } from "@/lib/public-proxy";

/**
 * POST /api/public/comments/[id]/unlike → 远端 POST /public/comments/{id}/unlike
 *
 * 远端契约（scripts/swagger.yaml 的 /public/comments/{id}/unlike）：
 *   无 body，返回 data = 最新的点赞数（整数）。匿名可调用。
 *
 * ⚠️ 与 like 一样，后端不按人去重：重复调用会把计数一直减下去（甚至减成负数），
 * 所以只有「本浏览器确实点过赞」的评论才允许走这个接口（前端 localStorage 记账）。
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return publicProxy(`/public/comments/${encodeURIComponent(id)}/unlike`, { method: "POST" });
}
