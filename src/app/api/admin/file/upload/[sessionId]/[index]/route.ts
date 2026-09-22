import type { NextRequest } from "next/server";

import { authedProxyFetch } from "@/lib/admin-api";

// 文件管理 · 上传分片：POST /api/admin/file/upload/[sessionId]/[index] → 远端 POST /file/upload/:sessionId/:index
// body: 该分片的原始二进制（application/octet-stream），最后一块传完由后端自动定稿成文件记录。
export async function POST(request: NextRequest, { params }: { params: Promise<{ sessionId: string; index: string }> }) {
    const { sessionId, index } = await params;

    const chunk = await request.arrayBuffer();
    if (chunk.byteLength === 0) {
        return Response.json({ code: 400, message: "分片内容为空", data: null }, { status: 400 });
    }

    return authedProxyFetch(`/file/upload/${encodeURIComponent(sessionId)}/${encodeURIComponent(index)}`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: chunk,
    });
}
