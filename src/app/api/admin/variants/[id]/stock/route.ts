import { NextRequest, NextResponse } from "next/server";
import { adminProxyFetch } from "@/lib/admin-api";
import { validateImportStockBody, validateProxyId } from "@/lib/api-orders-products";

// 型号的卡密库存：转发远端 PRO 模块 /pro/admin/variants/{id}/stock。
//
// · GET  官方 product.ts L72-74 卡密列表（查询参数 page / page_size / status 原样透传）
// · POST 官方 product.ts L65-67 导入卡密 —— **远端真实路径带 /import 后缀**
//        （`/api/pro/admin/variants/${variantId}/stock/import`，以官方源码为准），
//        本地对外保持 /api/admin/variants/{id}/stock 这一个路径。
//        body = ImportStockRequest { items?: string[]; item_text?: string }（src/types/product.ts L148-151）。
//
// ⚠️ 导入是写操作，本轮**未对线上实测**；本地只做参数校验后转发。

type Params = Promise<{ id: string }>;

/** GET /api/admin/variants/[id]/stock —— 卡密库存列表 */
export async function GET(request: NextRequest, { params }: { params: Params }) {
    const { id } = await params;
    const invalid = validateProxyId(id);
    if (invalid) {
        return NextResponse.json({ code: 400, message: invalid, data: null }, { status: 400 });
    }
    const qs = request.nextUrl.searchParams.toString();
    return adminProxyFetch(`/pro/admin/variants/${encodeURIComponent(id)}/stock${qs ? `?${qs}` : ""}`, {
        method: "GET",
    });
}

/** POST /api/admin/variants/[id]/stock —— 导入卡密库存（远端 /stock/import） */
export async function POST(request: NextRequest, { params }: { params: Params }) {
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

    const invalid = validateImportStockBody(body);
    if (invalid) {
        return NextResponse.json({ code: 400, message: invalid, data: null }, { status: 400 });
    }

    return adminProxyFetch(`/pro/admin/variants/${encodeURIComponent(id)}/stock/import`, {
        method: "POST",
        body: JSON.stringify(body),
    });
}
