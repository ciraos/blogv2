import { NextRequest, NextResponse } from "next/server";

import { adminProxyFetch } from "@/lib/admin-api";

// 图片样式配置（存储策略维度）：
//   GET /api/admin/image-styles/:id → 远端 GET /policies/:id/image-styles
//   PUT /api/admin/image-styles/:id → 远端 PUT /policies/:id/image-styles
//
// 证据：
//  - 路由 internal/infra/router/router.go:528-535（policies 组，JWTAuth + AdminAuth，
//    GET/PUT 都在，且 GET "/:id/image-styles" 必须排在 GET "/:id" 之前）
//  - handler pkg/handler/storage_policy/image_styles.go:22,43
//  - 线上只读探活：GET /api/policies/1/image-styles 未登录 401（路由存在）
//
// 请求/响应体（两侧同一结构，Go DTO model.PolicyImageStylesPayload）：
//   { image_process: ImageProcessConfig, image_styles: ImageStyleConfig[] }
// ⚠️ 云策略（type != local）后端会把 image_process.auto_compress 置空（历史脏数据不暴露），
//    并且 PUT 时对云策略校验 auto_compress（ValidateAutoCompressPolicy）——前端据此禁用该块。
type Params = Promise<{ id: string }>;

export async function GET(_request: NextRequest, { params }: { params: Params }) {
    const { id } = await params;
    return adminProxyFetch(`/policies/${encodeURIComponent(id)}/image-styles`, { method: "GET" });
}

export async function PUT(request: NextRequest, { params }: { params: Params }) {
    const { id } = await params;
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ code: 400, message: "请求体格式错误（需 JSON）", data: null }, { status: 400 });
    }
    // body 原样透传：远端 handler 用 ValidateConfig / ValidateAutoCompressPolicy 做权威校验，
    // 代理层再实现一份只会两处漂移（与 /api/admin/cache/revalidate 的处理口径一致）。
    return adminProxyFetch(`/policies/${encodeURIComponent(id)}/image-styles`, {
        method: "PUT",
        body: JSON.stringify(body),
    });
}
