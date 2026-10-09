import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { adminProxyFetch } from "@/lib/admin-api";

// 「管理系列文章」：取某系列及其名下文章列表。
//   GET /api/admin/doc-series/{id}/articles → 远端 GET /public/doc-series/{id}/articles
//   （router.go:330，公开只读接口；带上 token 也无妨，后端不校验）
//   返回 { code, message, data: DocSeriesWithArticles }
//     data = DocSeriesResponse + { articles: [{ id, title, abbrlink, doc_sort, created_at }] }
//   （pkg/domain/model/docseries.go:64-77）。
//   ⚠️ 远端只返回 **已发布且 is_doc=true** 的文章，并且按 doc_sort、created_at 升序
//   （internal/infra/persistence/ent/doc_series_repo.go:159-167），草稿不会出现在这个列表里。
interface RouteContext {
    params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
    const { id } = await params;
    if (!id) {
        return NextResponse.json({ code: 400, message: "系列 ID 不能为空", data: null }, { status: 400 });
    }
    return adminProxyFetch(`/public/doc-series/${encodeURIComponent(id)}/articles`, { method: "GET" });
}
