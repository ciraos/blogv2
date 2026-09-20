import type { NextRequest } from "next/server";

import { authedProxyFetch } from "@/lib/admin-api";

// 文件管理 · 新建空文件或目录：POST /api/admin/file/create → 远端 POST /file/create
// body: { uri: "anzhiyu://my/新文件夹", type: 1|2, err_on_conflict?: boolean }
export async function POST(request: NextRequest) {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return Response.json({ code: 400, message: "请求体格式错误", data: null }, { status: 400 });
    }
    return authedProxyFetch("/file/create", { method: "POST", body: JSON.stringify(body) });
}
