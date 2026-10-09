import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { adminProxyFetch } from "@/lib/admin-api";

// 文档系列：更新 / 删除（同源代理 → 远端 /doc-series/{id}，需管理员登录；
// router.go:337-340）。
//
// PUT    /api/admin/doc-series/{id} → 远端 PUT /doc-series/{id}
//        请求体照官方前端 DocSeriesFormModal.tsx:63-68 抄（整表单提交）：
//        { name, description, cover_url, sort }；后端 UpdateDocSeriesRequest
//        （pkg/domain/model/docseries.go:37-42）四个字段全是指针，支持只传改动项，
//        所以这里允许部分字段（但至少一个）。
//        返回 { code, message, data: DocSeriesResponse }。
// DELETE /api/admin/doc-series/{id} → 远端 DELETE /doc-series/{id}
//        ⚠️ 远端会拒绝删除仍有文档的系列（pkg/service/doc_series/service.go:134-143
//        「无法删除，该系列下还有 N 篇文档」），本地不重复判断，交给远端返回文案。
interface RouteContext {
    params: Promise<{ id: string }>;
}

/** 允许透传的更新字段（其余丢弃） */
interface UpdateBody {
    name?: string;
    description?: string;
    cover_url?: string;
    sort?: number;
}

function badRequest(message: string): NextResponse {
    return NextResponse.json({ code: 400, message, data: null }, { status: 400 });
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
    const { id } = await params;
    if (!id) return badRequest("系列 ID 不能为空");

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
    const payload: UpdateBody = {};

    if (body.name !== undefined) {
        if (typeof body.name !== "string" || body.name.trim() === "") {
            return badRequest("系列名称不能为空");
        }
        payload.name = body.name.trim();
    }
    if (body.description !== undefined) {
        if (typeof body.description !== "string") return badRequest("description 必须是字符串");
        payload.description = body.description;
    }
    if (body.cover_url !== undefined) {
        if (typeof body.cover_url !== "string") return badRequest("cover_url 必须是字符串");
        payload.cover_url = body.cover_url;
    }
    if (body.sort !== undefined) {
        if (typeof body.sort !== "number" || !Number.isFinite(body.sort)) {
            return badRequest("sort 必须是数字");
        }
        payload.sort = Math.trunc(body.sort);
    }

    if (Object.keys(payload).length === 0) {
        return badRequest("至少需要提供 name / description / cover_url / sort 中的一个字段");
    }

    return adminProxyFetch(`/doc-series/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: JSON.stringify(payload),
    });
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
    const { id } = await params;
    if (!id) return badRequest("系列 ID 不能为空");
    return adminProxyFetch(`/doc-series/${encodeURIComponent(id)}`, { method: "DELETE" });
}
