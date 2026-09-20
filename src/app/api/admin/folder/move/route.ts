import type { NextRequest } from "next/server";

import { authedProxyFetch } from "@/lib/admin-api";

// 文件管理 · 移动：POST /api/admin/folder/move → 远端 POST /folder/move
// body: { sourceIDs: string[], destinationID: string }
export async function POST(request: NextRequest) {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return Response.json({ code: 400, message: "请求体格式错误", data: null }, { status: 400 });
    }
    return authedProxyFetch("/folder/move", { method: "POST", body: JSON.stringify(body) });
}
