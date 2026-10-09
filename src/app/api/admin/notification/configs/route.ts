import { adminProxyFetch } from "@/lib/admin-api";

/**
 * GET /api/admin/notification/configs —— 当前登录用户的通知配置详情。
 *
 * 远端契约（源码证据）：
 *  - internal/infra/router/router.go:857-865 用户通知组（**仅 JWTAuth**，管理端用户自己也是用户，
 *    所以这里复用管理端代理即可）注册 GET /user/notification-configs。
 *  - pkg/handler/notification/handler.go:184-204 GetUserNotificationConfigs
 *    → data = []UserNotificationConfigDTO（pkg/handler/notification/dto.go:25-36）：
 *      { id, userId, notificationTypeId, isEnabled, enabledChannels,
 *        notificationEmail?, customSettings?, notificationType?, createdAt, updatedAt }
 *  - 后端**没有** PUT /user/notification-configs（router.go:864 只有 GET），
 *    所以本代理只暴露 GET，由页面按只读展示 + 说明。
 */
export async function GET() {
    return adminProxyFetch("/user/notification-configs", { method: "GET" });
}
