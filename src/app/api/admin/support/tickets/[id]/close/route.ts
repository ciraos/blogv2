import { NextRequest } from "next/server";
import { adminProxyFetch } from "@/lib/admin-api";

// 关闭工单：转发远端 PRO 模块 /pro/admin/support/tickets/{id}/close（官方 support.ts L41-43）。
// 官方前端调用时**不带 body**，这里保持一致，不凭空造请求体。

type Params = Promise<{ id: string }>;

/** POST /api/admin/support/tickets/[id]/close —— 关闭工单 */
export async function POST(_request: NextRequest, { params }: { params: Params }) {
    const { id } = await params;
    return adminProxyFetch(`/pro/admin/support/tickets/${encodeURIComponent(id)}/close`, { method: "POST" });
}
