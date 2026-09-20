import type { NextRequest } from "next/server";

import { authedProxyFetch } from "@/lib/admin-api";

// 文件管理 · 重命名：PUT /api/admin/file/rename → 远端 PUT /file/rename
// body: { id: 公共ID, new_name: "新名称" }
export async function PUT(request: NextRequest) {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return Response.json({ code: 400, message: "请求体格式错误", data: null }, { status: 400 });
    }
    return authedProxyFetch("/file/rename", { method: "PUT", body: JSON.stringify(body) });
}
