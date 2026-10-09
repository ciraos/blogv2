import { NextRequest, NextResponse } from "next/server";
import { adminProxyFetch } from "@/lib/admin-api";
import { validateProductBody } from "@/lib/api-orders-products";

// 管理员商品列表 / 新增：转发远端 PRO 模块 /pro/admin/products。
// 后端不开放 CORS 且需鉴权，浏览器端不能直连，由本路由读取 httpOnly cookie 中的 token 转发。
//
// · GET  官方 product.ts L23-25（查询参数 page / page_size / keyword / status 原样透传）
// · POST 官方 product.ts L37-39，body = CreateProductRequest（src/types/product.ts L99-108）

/** GET /api/admin/products 管理端商品列表 */
export async function GET(request: NextRequest) {
    const qs = request.nextUrl.searchParams.toString();
    return adminProxyFetch(`/pro/admin/products${qs ? `?${qs}` : ""}`, { method: "GET" });
}

/**
 * POST /api/admin/products 新增商品。
 * 本地先校验 body（title 必填、price ≥ 0、delivery_method 枚举、status 1/2/3 …），
 * 非法直接 400，**不转发**给线上后端（写操作本轮不实测）。
 */
export async function POST(request: NextRequest) {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ code: 400, message: "请求体必须是合法 JSON", data: null }, { status: 400 });
    }

    const invalid = validateProductBody(body, "create");
    if (invalid) {
        return NextResponse.json({ code: 400, message: invalid, data: null }, { status: 400 });
    }

    return adminProxyFetch("/pro/admin/products", { method: "POST", body: JSON.stringify(body) });
}
