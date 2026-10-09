import { NextRequest, NextResponse } from "next/server";
import { adminProxyFetch } from "@/lib/admin-api";
import { validateOrderListBody } from "@/lib/api-orders-products";

// 管理员订单列表（POST 版）：转发远端 PRO 模块 /pro/admin/orders/list（官方 order.ts L20-22）。
// body = OrderListParams（page / page_size / status / payment_provider / order_type / order_no /
// trade_no / user_email / start_date / end_date / sort_by / sort_order）。
//
// 语义上是「带筛选的查询」，不是写操作；但仍然按代理层约定先做本地参数校验：
// body 不是合法 JSON 对象 / 字段类型不对 / 枚举取值非法 → 本地 400，**不转发**给线上后端。

/** POST /api/admin/orders/list —— 带筛选的订单列表 */
export async function POST(request: NextRequest) {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ code: 400, message: "请求体必须是合法 JSON", data: null }, { status: 400 });
    }

    const invalid = validateOrderListBody(body);
    if (invalid) {
        return NextResponse.json({ code: 400, message: invalid, data: null }, { status: 400 });
    }

    return adminProxyFetch("/pro/admin/orders/list", { method: "POST", body: JSON.stringify(body) });
}
