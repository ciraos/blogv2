import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { adminProxyFetch } from "@/lib/admin-api";

// 文档系列：列表 + 新建（同源代理 → 远端 /doc-series，需管理员登录；见
// scripts/anheyu/anheyu-app-main/internal/infra/router/router.go:334-341）。
//
// GET  /api/admin/doc-series?page=&pageSize=&keyword=  → 远端 GET /doc-series
//      查询参数（page / pageSize / keyword）原样透传。
//      ⚠️ 远端列表 handler 只读 page / pageSize
//      （pkg/handler/doc_series/handler.go:71-78），keyword 会被忽略（社区版
//      ListDocSeriesOptions 里没有关键词字段，pkg/domain/model/docseries.go:80-83）——
//      这里仍原样透传，是为了线上后端将来支持时前端不用改。
// POST /api/admin/doc-series                            → 远端 POST /doc-series
//      请求体照官方前端 DocSeriesFormModal.tsx:63-68 抄：
//      { name（必填）, description, cover_url, sort }（pkg/domain/model/docseries.go:29-34）。
//      返回 { code, message, data: DocSeriesResponse }。
export async function GET(request: NextRequest) {
    const qs = request.nextUrl.searchParams.toString();
    return adminProxyFetch(`/doc-series${qs ? `?${qs}` : ""}`, { method: "GET" });
}

/** 只认这四个字段，其余一律丢弃（不透传客户端塞进来的额外字段） */
interface CreateBody {
    name: string;
    description: string;
    cover_url: string;
    sort: number;
}

function badRequest(message: string): NextResponse {
    return NextResponse.json({ code: 400, message, data: null }, { status: 400 });
}

export async function POST(request: NextRequest) {
    let raw: unknown;
    try {
        raw = await request.json();
    } catch {
        return badRequest("请求体格式错误（需 JSON 对象）");
    }

    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
        return badRequest("请求体格式错误（需 JSON 对象）");
    }

    const body = raw as Record<string, unknown>;

    // name：远端 binding:"required"，本地先拦掉空值，省一次必然失败的往返
    if (typeof body.name !== "string" || body.name.trim() === "") {
        return badRequest("系列名称不能为空");
    }
    if (body.description !== undefined && typeof body.description !== "string") {
        return badRequest("description 必须是字符串");
    }
    if (body.cover_url !== undefined && typeof body.cover_url !== "string") {
        return badRequest("cover_url 必须是字符串");
    }
    if (body.sort !== undefined && (typeof body.sort !== "number" || !Number.isFinite(body.sort))) {
        return badRequest("sort 必须是数字");
    }

    const payload: CreateBody = {
        name: body.name.trim(),
        description: typeof body.description === "string" ? body.description : "",
        cover_url: typeof body.cover_url === "string" ? body.cover_url : "",
        sort: typeof body.sort === "number" ? Math.trunc(body.sort) : 0,
    };

    return adminProxyFetch("/doc-series", { method: "POST", body: JSON.stringify(payload) });
}
