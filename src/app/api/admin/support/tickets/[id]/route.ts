import { NextRequest } from "next/server";
import { adminProxyFetch } from "@/lib/admin-api";

// 工单单条：转发远端 PRO 模块 /pro/admin/support/tickets/{id}（官方 support.ts L27-29、L55-57）。

type Params = Promise<{ id: string }>;

/** GET /api/admin/support/tickets/[id] —— 工单详情（含 messages 会话记录） */
export async function GET(_request: NextRequest, { params }: { params: Params }) {
    const { id } = await params;
    return adminProxyFetch(`/pro/admin/support/tickets/${encodeURIComponent(id)}`, { method: "GET" });
}

/** DELETE /api/admin/support/tickets/[id] —— 删除工单 */
export async function DELETE(_request: NextRequest, { params }: { params: Params }) {
    const { id } = await params;
    return adminProxyFetch(`/pro/admin/support/tickets/${encodeURIComponent(id)}`, { method: "DELETE" });
}
