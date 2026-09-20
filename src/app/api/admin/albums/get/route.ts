import type { NextRequest } from "next/server";

import { authedProxyFetch } from "@/lib/admin-api";

// 相册管理 · 图片列表 / 新增
//   GET  /api/admin/albums/get?page=1&pageSize=12&categoryId=&tag=&sort=  → 远端 GET /albums/get
//   POST /api/admin/albums/add                                            → 远端 POST /albums/add
// 注意：线上是 /albums/get 与 /albums/add（实测；swagger 里的 /albums 是旧版）。
export async function GET(request: NextRequest) {
    const qs = request.nextUrl.searchParams;
    const params = new URLSearchParams();
    params.set("page", qs.get("page") || "1");
    params.set("pageSize", qs.get("pageSize") || "12");
    for (const key of ["categoryId", "tag", "sort"]) {
        const value = qs.get(key);
        if (value) params.set(key, value);
    }
    return authedProxyFetch(`/albums/get?${params.toString()}`, { method: "GET" });
}

export async function POST(request: NextRequest) {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return Response.json({ code: 400, message: "请求体格式错误", data: null }, { status: 400 });
    }
    return authedProxyFetch("/albums/add", { method: "POST", body: JSON.stringify(body) });
}
