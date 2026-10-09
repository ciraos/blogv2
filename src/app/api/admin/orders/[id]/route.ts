import { NextRequest, NextResponse } from "next/server";
import { adminProxyFetch } from "@/lib/admin-api";
import { validateOrderId } from "@/lib/api-orders-products";

// 订单单条：转发远端 PRO 模块 /pro/admin/orders/{id}（官方 order.ts L27-29）。
//
// ⚠️ 远端只提供 DELETE，而且是**软删除**（后端没有「关闭订单 / 退款」接口，
//    所以后台不再提供这两个按钮，见 src/components/admin/orders-manager.tsx）。
// ⚠️ 本轮**未对线上实测**任何写操作；这里只做 id 校验后转发。

type Params = Promise<{ id: string }>;

/** DELETE /api/admin/orders/[id] —— 删除订单（软删除） */
export async function DELETE(_request: NextRequest, { params }: { params: Params }) {
    const { id } = await params;
    const invalid = validateOrderId(id);
    if (invalid) {
        return NextResponse.json({ code: 400, message: invalid, data: null }, { status: 400 });
    }
    return adminProxyFetch(`/pro/admin/orders/${encodeURIComponent(id)}`, { method: "DELETE" });
}
