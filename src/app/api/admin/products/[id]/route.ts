import { NextRequest, NextResponse } from "next/server";
import { adminProxyFetch } from "@/lib/admin-api";
import { validateProductBody, validateProxyId } from "@/lib/api-orders-products";

// 商品单条：转发远端 PRO 模块 /pro/admin/products/{id}。
//
// · GET    官方 product.ts L30-32 商品详情（含 variants）
// · PUT    官方 product.ts L44-46 更新商品；官方 UpdateProductRequest 字段全部可选，
//          **上下架 / 首页展示 = 只传 { status } / { show_on_homepage }**
// · DELETE 官方 product.ts L51-53 删除商品
//
// ⚠️ 写操作（PUT / DELETE）本轮**未对线上实测**；本地只做参数校验后转发。

type Params = Promise<{ id: string }>;

/** GET /api/admin/products/[id] —— 商品详情 */
export async function GET(_request: NextRequest, { params }: { params: Params }) {
    const { id } = await params;
    const invalid = validateProxyId(id);
    if (invalid) {
        return NextResponse.json({ code: 400, message: invalid, data: null }, { status: 400 });
    }
    return adminProxyFetch(`/pro/admin/products/${encodeURIComponent(id)}`, { method: "GET" });
}

/** PUT /api/admin/products/[id] —— 更新商品（上下架 / 首页展示也走它） */
export async function PUT(request: NextRequest, { params }: { params: Params }) {
    const { id } = await params;
    const invalidId = validateProxyId(id);
    if (invalidId) {
        return NextResponse.json({ code: 400, message: invalidId, data: null }, { status: 400 });
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ code: 400, message: "请求体必须是合法 JSON", data: null }, { status: 400 });
    }

    const invalid = validateProductBody(body, "update");
    if (invalid) {
        return NextResponse.json({ code: 400, message: invalid, data: null }, { status: 400 });
    }

    return adminProxyFetch(`/pro/admin/products/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: JSON.stringify(body),
    });
}

/** DELETE /api/admin/products/[id] —— 删除商品 */
export async function DELETE(_request: NextRequest, { params }: { params: Params }) {
    const { id } = await params;
    const invalid = validateProxyId(id);
    if (invalid) {
        return NextResponse.json({ code: 400, message: invalid, data: null }, { status: 400 });
    }
    return adminProxyFetch(`/pro/admin/products/${encodeURIComponent(id)}`, { method: "DELETE" });
}
