import type { NextRequest } from "next/server";
import { revalidateTag } from "next/cache";

import { authedProxyFetch } from "@/lib/admin-api";
import { PAGES_TAG } from "@/lib/api";

// 页面管理 · 列表 / 新建（远端 /pages，需登录 + 管理员）
//   GET  /api/admin/pages?page=1&page_size=10&search=xx&is_published=true → 远端 GET /pages
//   POST /api/admin/pages                                                 → 远端 POST /pages
// 注意：入参是 page_size（下划线）。
export async function GET(request: NextRequest) {
    const qs = request.nextUrl.searchParams;
    const params = new URLSearchParams();
    params.set("page", qs.get("page") || "1");
    params.set("page_size", qs.get("page_size") || "10");
    const search = qs.get("search");
    if (search) params.set("search", search);
    const isPublished = qs.get("is_published");
    if (isPublished) params.set("is_published", isPublished);

    return authedProxyFetch(`/pages?${params.toString()}`, { method: "GET" });
}

export async function POST(request: NextRequest) {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return Response.json({ code: 400, message: "请求体格式错误", data: null }, { status: 400 });
    }
    const res = await authedProxyFetch("/pages", { method: "POST", body: JSON.stringify(body) });
    // 新建页面 → 自定义页缓存立刻失效（前台 /message 这类页面马上能访问）
    if (res.ok) revalidateTag(PAGES_TAG, { expire: 0 });
    return res;
}
