import type { NextRequest } from "next/server";

import { authedProxyFetch } from "@/lib/admin-api";

// 文件管理 · 列表 / 删除
//   GET    /api/admin/file?uri=anzhiyu://my/&next_token=...  → 远端 GET /file
//   DELETE /api/admin/file?ids=a&ids=b                       → 远端 DELETE /file?ids=a&ids=b
// 注意：线上后端是**单数** /file（实测 /files 为 404），Apifox 文档写的是复数，以实测为准。
export async function GET(request: NextRequest) {
    const qs = request.nextUrl.searchParams;
    const uri = qs.get("uri") || "anzhiyu://my/";
    const nextToken = qs.get("next_token");

    const params = new URLSearchParams({ uri });
    if (nextToken) params.set("next_token", nextToken);

    return authedProxyFetch(`/file?${params.toString()}`, { method: "GET" });
}

export async function DELETE(request: NextRequest) {
    const ids = request.nextUrl.searchParams.getAll("ids");
    if (ids.length === 0) {
        return Response.json({ code: 400, message: "缺少要删除的 ids", data: null }, { status: 400 });
    }
    const params = new URLSearchParams();
    for (const id of ids) params.append("ids", id);
    return authedProxyFetch(`/file?${params.toString()}`, { method: "DELETE" });
}
