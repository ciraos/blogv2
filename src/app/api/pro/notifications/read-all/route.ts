import { authedProxyFetch } from "@/lib/admin-api";

// 消息通知 · 全部标为已读：POST /api/pro/notifications/read-all → 远端 /pro/notifications/read-all
export async function POST() {
    return authedProxyFetch("/pro/notifications/read-all", { method: "POST" });
}
