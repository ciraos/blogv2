import { NextRequest, NextResponse } from "next/server";

import { adminProxyFetch } from "@/lib/admin-api";

// 知识库 · 文档列表 / 新建索引（PRO 模块，远端需登录 + 管理员）。
// 远端路径证据：官方前端快照 src/lib/api/knowledge.ts（BASE = /api/pro/admin/knowledge）。
//   GET  /pro/admin/knowledge/documents?status&page&page_size → 列表 { documents, total, page, page_size }
//   POST /pro/admin/knowledge/documents                      → body { title, content, metadata? }
// querystring 原样透传：后端只认 status / page / page_size（官方 ListKnowledgeDocumentsRequest），
// 这层不做白名单，避免以后后端加参数还要改两处。
export async function GET(request: NextRequest) {
    const qs = request.nextUrl.searchParams.toString();
    return adminProxyFetch(`/pro/admin/knowledge/documents${qs ? `?${qs}` : ""}`, { method: "GET" });
}

export async function POST(request: NextRequest) {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ code: 400, message: "请求体格式错误", data: null }, { status: 400 });
    }
    return adminProxyFetch("/pro/admin/knowledge/documents", {
        method: "POST",
        body: JSON.stringify(body),
    });
}
