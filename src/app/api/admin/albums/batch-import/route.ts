import type { NextRequest } from "next/server";

import { authedProxyFetch } from "@/lib/admin-api";

// 相册管理 · 批量导入（按 URL 抓取并自动解析元数据）
//   POST /api/admin/albums/batch-import → 远端 POST /albums/batch-import
//   body: { categoryId?, urls: string[]（1..100）, thumbParam?, bigParam?, tags?: string[], displayOrder? }
//   返回：{ successCount, failCount, skipCount, total, errors?, duplicates? }
export async function POST(request: NextRequest) {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return Response.json({ code: 400, message: "请求体格式错误", data: null }, { status: 400 });
    }
    return authedProxyFetch("/albums/batch-import", { method: "POST", body: JSON.stringify(body) });
}
