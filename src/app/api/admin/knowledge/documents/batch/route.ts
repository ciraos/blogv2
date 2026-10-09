import { NextRequest, NextResponse } from "next/server";

import { adminProxyFetch } from "@/lib/admin-api";

// 知识库 · 批量删除：DELETE /api/admin/knowledge/documents/batch body { ids: number[] }
// → 远端 DELETE /pro/admin/knowledge/documents/batch（官方前端 knowledge.ts:47-49）
// 静态段 batch 与同级动态段 [id] 并存：Next.js 里静态路由优先命中，所以这里不会被 :id 抢走。
export async function DELETE(request: NextRequest) {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ code: 400, message: "请求体格式错误（需 JSON）", data: null }, { status: 400 });
    }

    const ids = typeof body === "object" && body !== null ? (body as { ids?: unknown }).ids : undefined;
    if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => typeof id === "number")) {
        return NextResponse.json({ code: 400, message: "ids 必须是非空数字数组", data: null }, { status: 400 });
    }

    return adminProxyFetch("/pro/admin/knowledge/documents/batch", {
        method: "DELETE",
        body: JSON.stringify({ ids }),
    });
}
