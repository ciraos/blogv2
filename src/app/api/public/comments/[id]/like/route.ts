import type { NextRequest } from "next/server";

import { publicProxy } from "@/lib/public-proxy";

/**
 * POST /api/public/comments/[id]/like → 远端 POST /public/comments/{id}/like
 *
 * 远端契约（scripts/swagger.yaml 的 /public/comments/{id}/like）：
 *   无 body，返回 data = 最新的点赞数（整数）。匿名可调用。
 *
 * 注意：后端只是计数器 +1/-1，**没有按人去重**。所以「同一浏览器只能点一次」靠前端
 * 在 localStorage 里记已点赞的评论 id（见 post-comments.tsx），不能指望后端拦住刷赞。
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return publicProxy(`/public/comments/${encodeURIComponent(id)}/like`, { method: "POST" });
}
