import { NextRequest, NextResponse } from "next/server";

import { authedProxyFetch } from "@/lib/admin-api";

// 用户中心 · 通知设置：GET/PUT /api/user/notification-settings → 远端 /user/notification-settings
// 返回/接收 { allowCommentReplyNotification: boolean }
export async function GET() {
    return authedProxyFetch("/user/notification-settings", { method: "GET" });
}

export async function PUT(request: NextRequest) {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ code: 400, message: "请求体格式错误", data: null }, { status: 400 });
    }
    return authedProxyFetch("/user/notification-settings", { method: "PUT", body: JSON.stringify(body) });
}
