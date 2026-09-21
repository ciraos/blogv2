import type { NextRequest } from "next/server";

import { authedProxyFetch } from "@/lib/admin-api";

// 朋友圈管理 · 批量删除（远端 POST /pro/admin/moments/batch-delete，body 为 { ids: number[] }）
export async function POST(request: NextRequest) {
    let body: { ids?: unknown };
    try {
        body = await request.json();
    } catch {
        return Response.json({ code: 400, message: "请求体格式错误", data: null }, { status: 400 });
    }
    const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter((id) => Number.isInteger(id) && id > 0) : [];
    if (ids.length === 0) {
        return Response.json({ code: 400, message: "请至少选择一条记录", data: null }, { status: 400 });
    }
    return authedProxyFetch("/pro/admin/moments/batch-delete", {
        method: "POST",
        body: JSON.stringify({ ids }),
    });
}
