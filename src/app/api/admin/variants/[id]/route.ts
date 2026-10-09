import { NextRequest, NextResponse } from "next/server";
import { adminProxyFetch } from "@/lib/admin-api";
import { validateProxyId } from "@/lib/api-orders-products";

// 商品型号（规格）单条：转发远端 PRO 模块 /pro/admin/variants/{id}（官方 product.ts L58-60）。
//
// ⚠️ 官方前端只声明了这个接口（deleteVariant），页面里**没有**用到 —— 删除型号的语义
//    按 REST 约定推断为「删掉该型号」，本轮未实测。商品的规格增改仍走
//    PUT /pro/admin/products/{id} 的 variants 数组（见 products/[id]/route.ts）。

type Params = Promise<{ id: string }>;

/** DELETE /api/admin/variants/[id] —— 删除型号 */
export async function DELETE(_request: NextRequest, { params }: { params: Params }) {
    const { id } = await params;
    const invalid = validateProxyId(id);
    if (invalid) {
        return NextResponse.json({ code: 400, message: invalid, data: null }, { status: 400 });
    }
    return adminProxyFetch(`/pro/admin/variants/${encodeURIComponent(id)}`, { method: "DELETE" });
}
