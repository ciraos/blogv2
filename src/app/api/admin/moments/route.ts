import type { NextRequest } from "next/server";

import { authedProxyFetch } from "@/lib/admin-api";

// 朋友圈管理 · 列表（远端 /pro/admin/moments，需登录 + 管理员 + PRO）
//   GET /api/admin/moments?page=1&page_size=10&keyword=xx&link_id=1&sort_by=published_at&sort_order=desc
// 注意：page_size 是下划线；keyword 空串不传、link_id 仅 > 0 时传（与官方后台前端一致）。
const SORT_BY = ["published_at", "created_at", "fetched_at", "link_name", "post_title"];
const SORT_ORDER = ["desc", "asc"];

export async function GET(request: NextRequest) {
    const qs = request.nextUrl.searchParams;
    const params = new URLSearchParams();
    params.set("page", qs.get("page") || "1");
    params.set("page_size", qs.get("page_size") || "10");

    const keyword = qs.get("keyword")?.trim();
    if (keyword) params.set("keyword", keyword);

    const linkId = Number(qs.get("link_id"));
    if (Number.isFinite(linkId) && linkId > 0) params.set("link_id", String(linkId));

    const sortBy = qs.get("sort_by");
    if (sortBy && SORT_BY.includes(sortBy)) params.set("sort_by", sortBy);
    const sortOrder = qs.get("sort_order");
    if (sortOrder && SORT_ORDER.includes(sortOrder)) params.set("sort_order", sortOrder);

    return authedProxyFetch(`/pro/admin/moments?${params.toString()}`, { method: "GET" });
}
