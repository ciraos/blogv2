import { adminProxyFetch } from "@/lib/admin-api";

/**
 * GET /api/admin/notification/types —— 通知类型列表（管理员）。
 *
 * 远端契约（源码证据）：
 *  - internal/infra/router/router.go:868-871 通知管理组（JWTAuth + AdminAuth）注册 GET /notification/types。
 *  - pkg/handler/notification/handler.go:61-76 ListNotificationTypes → response.Success(c, dtos, ...)
 *    → data = []NotificationTypeDTO（pkg/handler/notification/dto.go:11-22）：
 *      { id, code, name, description, category, isActive, defaultEnabled,
 *        supportedChannels, createdAt, updatedAt }
 *  - 纯读接口，无查询参数、无请求体。
 */
export async function GET() {
    return adminProxyFetch("/notification/types", { method: "GET" });
}
