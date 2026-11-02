import { authedProxyFetch } from "@/lib/admin-api";

// 用户中心 · 我的工单列表：GET /api/user/support-tickets → 远端 PRO /pro/support/tickets
// 说明：PRO 后端目前只提供管理端列表与用户侧「按 ID 查详情/回复」，这个列表接口尚未开放（404）；
// 弹窗会按「暂未开放」处理，等 PRO 补上同路径后前端自动可用。
export async function GET() {
    return authedProxyFetch("/pro/support/tickets", { method: "GET" });
}
