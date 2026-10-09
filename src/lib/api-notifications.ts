// 通知管理 / 用户通知配置 / 访问日志（客户端调用同源代理路由，不直连远端）。
//
// 为什么不复用 @/lib/api 里的 request：它是模块私有函数（未导出），而本文件按任务约定
// 只能新增、不能改动 src/lib/api.ts，所以这里自带一个同口径的小 fetch 助手
// （同源路径 → 解析 { code, message, data } 信封 → 失败抛 ApiError）。
// 错误类型直接复用 @/lib/api 导出的 ApiError 类，调用方 catch 到的形状与其它接口一致。
//
// 远端接口与形状（源码证据，非猜测）：
//  - GET  /notification/types            （internal/infra/router/router.go:870，JWTAuth + AdminAuth）
//      → pkg/handler/notification/handler.go:61-76 ListNotificationTypes
//      → data = NotificationTypeDTO[]（pkg/handler/notification/dto.go:11-22）：
//        { id, code, name, description, category, isActive, defaultEnabled,
//          supportedChannels, createdAt, updatedAt }
//  - GET  /user/notification-configs     （router.go:864，仅 JWTAuth）
//      → handler.go:184-204 GetUserNotificationConfigs
//      → data = UserNotificationConfigDTO[]（dto.go:25-36）：
//        { id, userId, notificationTypeId, isEnabled, enabledChannels,
//          notificationEmail?, customSettings?, notificationType?, createdAt, updatedAt }
//  - GET/PUT /user/notification-settings （router.go:860-861，仅 JWTAuth）
//      → handler.go:87-118 / 130-173，形状 { allowCommentReplyNotification: boolean }
//        （dto.go:53-60）。⚠️ PUT 是**写操作**：只实现不实测。
//  - GET  /statistics/visitor-logs       （router.go:706，JWTAuth + AdminAuth）
//      → pkg/handler/statistics/statistics_handler.go:263-355 GetVisitorLogs
//      → 查询参数 start_date / end_date（YYYY-MM-DD，handler.go:285-300，格式错 → 400）、
//        page（默认 1）、page_size（默认 20，**上限 200**，handler.go:273-279）
//      → data = { list, total, page, page_size }，其中 list 为精简 DTO（handler.go:320-346）：
//        { user_agent, ip_address, city, url_path, duration, created_at }
//        （user_agent / city 后端可能为空串；created_at 是 RFC3339 字符串）

import { ApiError } from "@/lib/api";

/** 后端统一响应信封 { code, message, data }（pkg/response/response.go:24） */
interface ApiEnvelope<T> {
    code: number;
    message: string;
    data: T;
}

// ===================== 通知类型 =====================

/** 通知类型（远端 NotificationTypeDTO，dto.go:11-22） */
export interface NotificationType {
    id: number;
    code: string;
    name: string;
    description: string;
    /** 分类（后端自定义字符串，如 comment / system） */
    category: string;
    /** 该类型是否启用（后台开关） */
    isActive: boolean;
    /** 新用户默认是否开启 */
    defaultEnabled: boolean;
    /** 支持的投递渠道 */
    supportedChannels: string[] | null;
    createdAt: string;
    updatedAt: string;
}

// ===================== 用户通知配置 =====================

/** 用户通知配置（远端 UserNotificationConfigDTO，dto.go:25-36） */
export interface UserNotificationConfig {
    id: number;
    userId: number;
    notificationTypeId: number;
    /** 该用户对该类型是否开启 */
    isEnabled: boolean;
    enabledChannels: string[] | null;
    /** 通知邮箱（可能不返回） */
    notificationEmail?: string;
    /** 自定义设置（后端 map[string]interface{}，结构随类型而变） */
    customSettings?: Record<string, unknown>;
    /** 关联的通知类型（后端预加载时才带） */
    notificationType?: NotificationType;
    createdAt: string;
    updatedAt: string;
}

/** 简化版用户通知设置（远端 SimpleUserNotificationSettingsResponse，dto.go:57-60） */
export interface UserNotificationSettings {
    /** 是否接收评论回复通知 */
    allowCommentReplyNotification: boolean;
}

// ===================== 访问日志 =====================

/** 访问日志单条（远端 VisitorLogDTO，statistics_handler.go:320-327） */
export interface VisitorLog {
    /** 浏览器 UA（后端字段可为空串） */
    user_agent: string;
    ip_address: string;
    /** IP 归属城市（可为空串） */
    city: string;
    /** 访问路径 */
    url_path: string;
    /** 停留时长（后端是整型，单位由后端决定，这里原样展示） */
    duration: number;
    /** RFC3339 时间串 */
    created_at: string;
}

/** 访问日志响应 data（statistics_handler.go:349-354） */
export interface VisitorLogPage {
    list: VisitorLog[];
    /** 时间范围内的日志总条数（不是分页总数） */
    total: number;
    page: number;
    page_size: number;
}

/** 访问日志查询参数（字段名与后端 query 参数完全一致） */
export interface VisitorLogQuery {
    /** 开始日期 YYYY-MM-DD（后端默认最近 7 天） */
    startDate?: string;
    /** 结束日期 YYYY-MM-DD（后端默认今天） */
    endDate?: string;
    page?: number;
    pageSize?: number;
}

/** 后端对 page_size 的硬上限（statistics_handler.go:277-279） */
export const VISITOR_LOG_MAX_PAGE_SIZE = 200;

/** YYYY-MM-DD（严格：月 01-12、日 01-31，且必须是真实存在的日期） */
const DATE_RE = /^\d{4}-(\d{2})-(\d{2})$/;

/** 校验并规范化一个 YYYY-MM-DD 日期串；非法返回 null */
export function normalizeDateInput(value: string): string | null {
    const trimmed = value.trim();
    if (trimmed === "") return null;
    const m = DATE_RE.exec(trimmed);
    if (!m) return null;
    const month = Number(m[1]);
    const day = Number(m[2]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const d = new Date(`${trimmed}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return null;
    // 借 Date 归一化反查：2026-02-31 会被算成 3 月，反查不一致就判为非法
    const iso = d.toISOString().slice(0, 10);
    return iso === trimmed ? trimmed : null;
}

/** 把正整数参数夹到 [1, max]；非法（NaN / <=0）回落 fallback */
export function clampPositiveInt(value: number | undefined, fallback: number, max: number): number {
    if (value === undefined || !Number.isFinite(value)) return Math.min(fallback, max);
    const n = Math.floor(value);
    if (n < 1) return Math.min(fallback, max);
    return Math.min(n, max);
}

/** 同源代理路由的统一前缀 */
const BASE = "/api/admin";

/** 发一个 GET 并把信封里的 data 取出来；失败抛 ApiError（形状与 @/lib/api 一致） */
async function getEnvelope<T>(path: string): Promise<T> {
    let res: Response;
    try {
        res = await fetch(path, { method: "GET", cache: "no-store" });
    } catch {
        throw new ApiError("网络请求失败，请检查网络连接", 0, 0);
    }

    let json: ApiEnvelope<T> | null = null;
    try {
        json = (await res.json()) as ApiEnvelope<T>;
    } catch {
        // 非 JSON 响应（例如网关错误页），下面按 HTTP 状态兜底报错
    }

    if (res.ok && json && (json.code === 200 || json.code === 0)) {
        return json.data;
    }
    throw new ApiError(json?.message || `请求失败（HTTP ${res.status}）`, res.status, json?.code ?? res.status);
}

// ===================== 通知相关请求 =====================

/** GET /api/admin/notification/types —— 系统支持的全部通知类型（管理员） */
export async function getNotificationTypesApi(): Promise<NotificationType[]> {
    const data = await getEnvelope<NotificationType[] | null>(`${BASE}/notification/types`);
    // 后端空数据可能返回 null（Go nil 切片），统一按空数组处理
    return data ?? [];
}

/** GET /api/admin/notification/configs —— 当前登录用户的通知配置详情 */
export async function getUserNotificationConfigsApi(): Promise<UserNotificationConfig[]> {
    const data = await getEnvelope<UserNotificationConfig[] | null>(`${BASE}/notification/configs`);
    return data ?? [];
}

/** GET /api/admin/notification/settings —— 当前登录用户的简化版通知设置 */
export function getUserNotificationSettingsApi(): Promise<UserNotificationSettings> {
    return getEnvelope<UserNotificationSettings>(`${BASE}/notification/settings`);
}

/**
 * PUT /api/admin/notification/settings —— 保存简化版通知设置（⚠️ 写操作，仅实现不实测）。
 * 请求体形状与后端 SimpleUserNotificationSettingsRequest（dto.go:52-55）一致。
 */
export async function updateUserNotificationSettingsApi(
    payload: UserNotificationSettings
): Promise<UserNotificationSettings> {
    let res: Response;
    try {
        res = await fetch(`${BASE}/notification/settings`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            cache: "no-store",
        });
    } catch {
        throw new ApiError("网络请求失败，请检查网络连接", 0, 0);
    }

    let json: ApiEnvelope<UserNotificationSettings> | null = null;
    try {
        json = (await res.json()) as ApiEnvelope<UserNotificationSettings>;
    } catch {
        // 非 JSON 响应
    }

    if (res.ok && json && (json.code === 200 || json.code === 0)) {
        return json.data;
    }
    throw new ApiError(json?.message || `请求失败（HTTP ${res.status}）`, res.status, json?.code ?? res.status);
}

// ===================== 访问日志请求 =====================

/**
 * GET /api/admin/statistics/visitor-logs —— 访问日志（分页）。
 * 浏览器端先做一次与代理层相同的校验（日期格式 + page/page_size 范围），
 * 省掉必然失败的往返；非法输入直接抛 ApiError 而不是静默改参数。
 */
export async function getVisitorLogsApi(query: VisitorLogQuery = {}): Promise<VisitorLogPage> {
    const params = new URLSearchParams();

    if (query.startDate !== undefined && query.startDate.trim() !== "") {
        const start = normalizeDateInput(query.startDate);
        if (!start) throw new ApiError("开始日期格式错误，应为 YYYY-MM-DD", 400, 400);
        params.set("start_date", start);
    }
    if (query.endDate !== undefined && query.endDate.trim() !== "") {
        const end = normalizeDateInput(query.endDate);
        if (!end) throw new ApiError("结束日期格式错误，应为 YYYY-MM-DD", 400, 400);
        params.set("end_date", end);
    }
    params.set("page", String(clampPositiveInt(query.page, 1, Number.MAX_SAFE_INTEGER)));
    params.set("page_size", String(clampPositiveInt(query.pageSize, 20, VISITOR_LOG_MAX_PAGE_SIZE)));

    const data = await getEnvelope<VisitorLogPage | null>(`${BASE}/statistics/visitor-logs?${params.toString()}`);
    if (!data) {
        // 后端不该返回 null；真遇到时给出空页，避免调用方解构崩掉
        return { list: [], total: 0, page: 1, page_size: VISITOR_LOG_MAX_PAGE_SIZE };
    }
    return { ...data, list: data.list ?? [] };
}
