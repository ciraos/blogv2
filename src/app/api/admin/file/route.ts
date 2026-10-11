import type { NextRequest } from "next/server";

import { authedProxyFetch } from "@/lib/admin-api";

// 文件管理 · 列表 / 删除
//   GET    /api/admin/file?uri=anzhiyu://my/&next_token=...  → 远端 GET /file
//   DELETE /api/admin/file           体 { ids: string[] }    → 远端 DELETE /file  体 { ids }
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
    // ⚠️ 必须发 JSON 体而不是 query：远端 DeleteItems 是 c.ShouldBindJSON(model.DeleteItemsRequest)
    // （pkg/handler/file/operation.go:180-185），query 形式因为没有 body 会报 400「请求参数无效: EOF」。
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return Response.json({ code: 400, message: "请求体格式错误（需 { ids: string[] }）", data: null }, { status: 400 });
    }
    const ids = (body as { ids?: unknown } | null)?.ids;
    if (!Array.isArray(ids) || ids.length === 0 || ids.some((id) => typeof id !== "string" || !id)) {
        return Response.json({ code: 400, message: "ids 必须是非空字符串数组", data: null }, { status: 400 });
    }
    return authedProxyFetch("/file", { method: "DELETE", body: JSON.stringify({ ids }) });
}
