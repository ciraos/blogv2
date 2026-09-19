import { NextRequest } from "next/server";

import { authedProxyFetch } from "@/lib/admin-api";

// 消息通知 · 列表：GET /api/pro/notifications → 远端 /pro/notifications（需登录）。
// 查询参数（page / page_size / unread_only 等）原样透传；
// 远端返回 { code, message, data: { list: NotificationItem[], unread_count } }。
export async function GET(request: NextRequest) {
    const qs = request.nextUrl.searchParams.toString();
    return authedProxyFetch(`/pro/notifications${qs ? `?${qs}` : ""}`, { method: "GET" });
}
