import { NextRequest, NextResponse } from "next/server";

import { adminProxyFetch } from "@/lib/admin-api";

// 知识库 · 同步文章：POST /api/admin/knowledge/sync-articles body { force: boolean }
// → 远端 POST /pro/admin/knowledge/sync-articles（官方前端 knowledge.ts:71-73）
// force=true 会强制重新嵌入所有文章（写操作，前端要二次确认）。
export async function POST(request: NextRequest) {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ code: 400, message: "请求体格式错误（需 JSON）", data: null }, { status: 400 });
    }

    const force = typeof body === "object" && body !== null ? (body as { force?: unknown }).force : undefined;
    if (typeof force !== "boolean") {
        return NextResponse.json({ code: 400, message: "force 必须是布尔值", data: null }, { status: 400 });
    }

    return adminProxyFetch("/pro/admin/knowledge/sync-articles", {
        method: "POST",
        body: JSON.stringify({ force }),
    });
}
