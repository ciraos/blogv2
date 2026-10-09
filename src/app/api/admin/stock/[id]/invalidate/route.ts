import { NextRequest, NextResponse } from "next/server";
import { adminProxyFetch } from "@/lib/admin-api";
import { validateProxyId } from "@/lib/api-orders-products";

// 作废卡密：转发远端 PRO 模块 /pro/admin/stock/{id}/invalidate（官方 product.ts L79-81）。
// ⚠️ 官方前端调用时**不带 body**（POST 无参），这里保持一致；本轮未实测。

type Params = Promise<{ id: string }>;

/** POST /api/admin/stock/[id]/invalidate —— 作废卡密（无 body） */
export async function POST(_request: NextRequest, { params }: { params: Params }) {
    const { id } = await params;
    const invalid = validateProxyId(id);
    if (invalid) {
        return NextResponse.json({ code: 400, message: invalid, data: null }, { status: 400 });
    }
    return adminProxyFetch(`/pro/admin/stock/${encodeURIComponent(id)}/invalidate`, { method: "POST" });
}
