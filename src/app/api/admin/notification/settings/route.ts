import { NextRequest, NextResponse } from "next/server";

import { adminProxyFetch } from "@/lib/admin-api";

/**
 * GET/PUT /api/admin/notification/settings —— 当前登录用户的（简化版）通知设置。
 *
 * 远端契约（源码证据）：
 *  - internal/infra/router/router.go:857-861 用户通知组（仅 JWTAuth）：
 *      GET /user/notification-settings（router.go:860）、PUT /user/notification-settings（router.go:861）。
 *  - pkg/handler/notification/handler.go:87-118 GetUserNotificationSettings
 *    → data = { allowCommentReplyNotification: boolean }（dto.go:57-60）。
 *  - pkg/handler/notification/handler.go:130-173 UpdateUserNotificationSettings
 *    读 SimpleUserNotificationSettingsRequest（dto.go:52-55，**只有** allowCommentReplyNotification 一个字段），
 *    写库后回同样的形状；请求体解析失败 → 400「参数错误」。
 *
 * ⚠️ PUT 是写操作（改用户通知配置表）：按任务约定只实现不实测。
 *    代理层只做「JSON 可解析 + 形状校验」，不做字段默认值兜底，避免把缺字段的请求怼给后端。
 */

/** 校验请求体是否为 { allowCommentReplyNotification: boolean } */
function parseSettingsBody(raw: unknown): { allowCommentReplyNotification: boolean } | null {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
    const value = (raw as Record<string, unknown>).allowCommentReplyNotification;
    if (typeof value !== "boolean") return null;
    return { allowCommentReplyNotification: value };
}

export async function GET() {
    return adminProxyFetch("/user/notification-settings", { method: "GET" });
}

export async function PUT(request: NextRequest) {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ code: 400, message: "请求体格式错误", data: null }, { status: 400 });
    }

    const payload = parseSettingsBody(body);
    if (!payload) {
        return NextResponse.json(
            { code: 400, message: "参数错误：allowCommentReplyNotification 必须是布尔值", data: null },
            { status: 400 }
        );
    }

    return adminProxyFetch("/user/notification-settings", { method: "PUT", body: JSON.stringify(payload) });
}
