// 后台 PRO 模块的浏览器端 API 客户端：**会员管理** 与 **售后工单** 两个页面共用。
//
// 为什么另开文件而不是塞进 src/lib/api.ts：
//   · api.ts 里的 `request()` 没有导出（本轮不允许改 api.ts），而这两个模块全部走
//     「PRO 闭源接口 + 同源代理」的路径，与 api.ts 里已有的写法完全一致；
//   · 这里自带一份等价的 request 助手，失败时抛下面的 AdminModuleApiError（字段与 api.ts 的 ApiError 对齐）。
//
// 浏览器端不直连后端（后端不开放 CORS 且需鉴权），统一请求本站同源代理
// /api/admin/membership/* 与 /api/admin/support/*，由代理读取 httpOnly cookie 里的
// token 转发到远端 /pro/admin/membership/* 与 /pro/admin/support/*。
//
// 权威来源（官方前端快照 scripts/theme/theme-anheyu-next-main）：
//   · src/lib/api/membership.ts L19-56  → plans 增删改查 + members 列表
//   · src/lib/api/support.ts    L20-64  → tickets 列表/详情/回复/关闭/改状态/删除/统计

/** 与 api.ts 同名的错误类型（api.ts 已导出，这里只做等价实现，避免跨文件耦合实现细节） */
export class AdminModuleApiError extends Error {
    status: number;
    code: number;

    constructor(message: string, status: number, code: number) {
        super(message);
        this.name = "AdminModuleApiError";
        this.status = status;
        this.code = code;
    }
}

/**
 * 发一个请求到本站同源代理，并解包 { code, message, data } 信封。
 * 判定规则与 api.ts 的 request() 一致：HTTP 2xx 且业务 code 为 200 / 0 才算成功。
 */
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers = new Headers(options.headers);
    if (options.body && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
    }

    let res: Response;
    try {
        res = await fetch(path, { ...options, headers, cache: "no-store" });
    } catch {
        throw new AdminModuleApiError("网络请求失败，请检查网络连接", 0, 0);
    }

    let json: { code?: number; message?: string; data?: T } | null = null;
    try {
        json = (await res.json()) as { code?: number; message?: string; data?: T };
    } catch {
        // 非 JSON 响应（例如网关返回 HTML）
    }

    if (res.ok && json && (json.code === 200 || json.code === 0)) {
        return json.data as T;
    }

    // 代理层自己的错误信封（如未登录 401 / 无法连接后端 502）也走这里
    throw new AdminModuleApiError(
        json?.message || `请求失败（HTTP ${res.status}）`,
        res.status,
        json?.code ?? res.status
    );
}

/**
 * 把「可能被包了一层」的列表结果摊平成 { list, total }。
 *
 * 为什么需要它：本轮**不允许实测写操作**，也不允许对线上接口做超出只读探测的验证
 * （只读探测回来的一律是 401，拿不到真实响应体），所以后端到底返回
 * `{ list, total }`、`{ data: { list, total } }` 还是 `{ data: [...] }` 都没有实据。
 * 这里把三种常见形状都兼容掉，字段名对齐官方前端类型（list / total）。
 */
function unwrapList<T>(raw: unknown): { list: T[]; total: number } {
    // 形状 ①：data 直接就是数组（无分页信息）
    if (Array.isArray(raw)) return { list: raw as T[], total: raw.length };

    const box = (raw ?? {}) as Record<string, unknown>;
    // 形状 ②：data.list / data.total
    const inner = (box.data ?? box) as Record<string, unknown>;
    if (Array.isArray(inner)) return { list: inner as T[], total: inner.length };

    // 形状 ③：{ list, total }（可能还套了一层 data，上面已处理）
    const list = Array.isArray(inner.list) ? (inner.list as T[]) : [];
    const total = Number(inner.total);
    return { list, total: Number.isFinite(total) ? total : list.length };
}

/** 分页 + 可选筛选 → 查询串（undefined / null / 空串一律不拼，避免后端把空值当筛选条件） */
function buildQuery(params: Record<string, string | number | undefined>): string {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null || value === "") continue;
        qs.set(key, String(value));
    }
    const query = qs.toString();
    return query ? `?${query}` : "";
}

// ============================================================
// 一、会员管理（远端 /pro/admin/membership/*，官方 membership.ts）
// ============================================================

/**
 * 会员套餐（官方 src/types/membership.ts: MembershipPlan）。
 * ⚠️ price / original_price 的单位是**分**（官方 PlanEditDialog.tsx L91/L98 的 label 就是「价格（分）」），
 *    页面上要除以 100 显示；提交时也按分传。
 */
export interface MembershipPlan {
    id: string;
    name: string;
    description?: string;
    /** 价格（分） */
    price: number;
    /** 原价（分），可选 */
    original_price?: number;
    duration_days: number;
    /** 1=启用 2=停用（官方 use-memberships-page.ts L170：nextStatus = status === 1 ? 2 : 1） */
    status: number;
    sort_order: number;
    created_at?: string;
    updated_at?: string;
    [key: string]: unknown;
}

/** 用户会员（官方 src/types/membership.ts: UserMembership） */
export interface UserMembership {
    id: number;
    user_id: number;
    plan_id: number;
    plan_name?: string;
    is_member: boolean;
    start_time: string;
    expire_time: string;
    is_expired: boolean;
    created_at?: string;
    [key: string]: unknown;
}

/** 新增套餐请求体（官方 CreatePlanRequest；sort_order 由调用方按「最大排序 + 1」算好） */
export interface CreatePlanRequest {
    name: string;
    description?: string;
    price: number;
    original_price?: number;
    duration_days: number;
    status?: number;
    sort_order?: number;
}

/** 更新套餐请求体（官方 UpdatePlanRequest 是全部可选，所以切状态时只传 status 即可） */
export type UpdatePlanRequest = Partial<CreatePlanRequest>;

/** 会员列表查询参数（官方 ListMembersRequest：page / page_size / status） */
export interface ListMembersParams {
    page?: number;
    page_size?: number;
    status?: "active" | "expired";
}

/** 会员列表响应（官方 ListMembersResponse） */
export interface ListMembersData {
    list: UserMembership[];
    total: number;
}

/**
 * GET /pro/admin/membership/plans —— 套餐列表（官方 membership.ts L19-21，响应 { list }，无分页）。
 * 官方前端拿到后按 sort_order 升序排（use-memberships-page.ts L35），这里原样返回、由页面排序。
 */
export async function getAdminMembershipPlansApi(): Promise<MembershipPlan[]> {
    const raw = await request<unknown>("/api/admin/membership/plans", { method: "GET" });
    return unwrapList<MembershipPlan>(raw).list;
}

/** GET /pro/admin/membership/plans/{id} —— 套餐详情（官方 membership.ts L26-28） */
export function getAdminMembershipPlanApi(id: string): Promise<MembershipPlan> {
    return request<MembershipPlan>(`/api/admin/membership/plans/${encodeURIComponent(id)}`, { method: "GET" });
}

/** POST /pro/admin/membership/plans —— 新增套餐（官方 membership.ts L33-35） */
export function createAdminMembershipPlanApi(payload: CreatePlanRequest): Promise<MembershipPlan> {
    return request<MembershipPlan>("/api/admin/membership/plans", {
        method: "POST",
        body: JSON.stringify(payload),
    });
}

/** PUT /pro/admin/membership/plans/{id} —— 更新套餐（官方 membership.ts L40-42；切状态/排序也走它） */
export function updateAdminMembershipPlanApi(id: string, payload: UpdatePlanRequest): Promise<MembershipPlan> {
    return request<MembershipPlan>(`/api/admin/membership/plans/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: JSON.stringify(payload),
    });
}

/** DELETE /pro/admin/membership/plans/{id} —— 删除套餐（官方 membership.ts L47-49） */
export function deleteAdminMembershipPlanApi(id: string): Promise<unknown> {
    return request<unknown>(`/api/admin/membership/plans/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/**
 * GET /pro/admin/membership/members —— 会员用户列表（官方 membership.ts L54-56，分页 + status 筛选）。
 *
 * 注意：官方 ListMembersRequest 里**没有** keyword 字段，所以这里也不加（不猜参数）。
 * 页面的「搜索」是拿到当前页数据后的本地过滤。
 */
export async function getAdminMembershipMembersApi(params: ListMembersParams = {}): Promise<ListMembersData> {
    const query = buildQuery({
        page: params.page,
        page_size: params.page_size,
        status: params.status,
    });
    const raw = await request<unknown>(`/api/admin/membership/members${query}`, { method: "GET" });
    return unwrapList<UserMembership>(raw);
}

// ============================================================
// 二、售后工单（远端 /pro/admin/support/*，官方 support.ts）
// ============================================================

/** 工单状态（官方 support.ts: TicketStatus） */
export type TicketStatus = "OPEN" | "REPLIED" | "CLOSED";

/** 消息发送方（官方 support.ts: SenderType） */
export type SenderType = "USER" | "ADMIN";

/** 工单会话消息（官方 TicketMessage） */
export interface TicketMessage {
    id: string;
    content: string;
    sender_type: SenderType;
    sender_id?: number;
    created_at: string;
    [key: string]: unknown;
}

/** 工单（官方 Ticket） */
export interface Ticket {
    id: string;
    ticket_no: string;
    trade_no: string;
    order_id?: number;
    user_id?: number;
    user_email?: string;
    subject: string;
    type?: string;
    status: TicketStatus;
    message_count?: number;
    last_reply_at?: string;
    created_at: string;
    updated_at: string;
    [key: string]: unknown;
}

/** 工单详情（官方 TicketDetail = Ticket + messages） */
export interface TicketDetail extends Ticket {
    messages: TicketMessage[];
}

/** 工单统计（官方 TicketStatsResponse）：⚠️ 口径与 Ticket.status 不同名，见页面注释 */
export interface TicketStatsData {
    pending: number;
    processing: number;
    closed: number;
    total: number;
}

/** 工单列表查询参数（官方 ListTicketsRequest） */
export interface ListTicketsParams {
    page?: number;
    page_size?: number;
    status?: string;
    type?: string;
    keyword?: string;
}

/** 工单列表响应（官方 ListTicketsResponse） */
export interface ListTicketsData {
    list: Ticket[];
    total: number;
}

/**
 * GET /pro/admin/support/tickets —— 工单列表（官方 support.ts L20-22，分页 + status/type/keyword 筛选）
 */
export async function getAdminTicketsApi(params: ListTicketsParams = {}): Promise<ListTicketsData> {
    const query = buildQuery({
        page: params.page,
        page_size: params.page_size,
        status: params.status,
        type: params.type,
        keyword: params.keyword,
    });
    const raw = await request<unknown>(`/api/admin/support/tickets${query}`, { method: "GET" });
    return unwrapList<Ticket>(raw);
}

/**
 * GET /pro/admin/support/tickets/stats —— 工单统计（官方 support.ts L62-63）。
 * ⚠️ 这是静态段，必须优先于同级的 [id] 动态段（Next 路由里静态段优先，见 donations/total 同款注释）。
 */
export function getAdminTicketStatsApi(): Promise<TicketStatsData> {
    return request<TicketStatsData>("/api/admin/support/tickets/stats", { method: "GET" });
}

/** GET /pro/admin/support/tickets/{id} —— 工单详情（含 messages，官方 support.ts L27-29） */
export function getAdminTicketApi(id: string): Promise<TicketDetail> {
    return request<TicketDetail>(`/api/admin/support/tickets/${encodeURIComponent(id)}`, { method: "GET" });
}

/** POST /pro/admin/support/tickets/{id}/reply —— 管理员回复工单（官方 support.ts L34-36） */
export function replyAdminTicketApi(id: string, content: string): Promise<TicketMessage> {
    return request<TicketMessage>(`/api/admin/support/tickets/${encodeURIComponent(id)}/reply`, {
        method: "POST",
        body: JSON.stringify({ content }),
    });
}

/** POST /pro/admin/support/tickets/{id}/close —— 关闭工单（官方 support.ts L41-43，无 body） */
export function closeAdminTicketApi(id: string): Promise<unknown> {
    return request<unknown>(`/api/admin/support/tickets/${encodeURIComponent(id)}/close`, { method: "POST" });
}

/** PUT /pro/admin/support/tickets/{id}/status —— 更新工单状态（官方 support.ts L48-50） */
export function updateAdminTicketStatusApi(id: string, status: TicketStatus): Promise<unknown> {
    return request<unknown>(`/api/admin/support/tickets/${encodeURIComponent(id)}/status`, {
        method: "PUT",
        body: JSON.stringify({ status }),
    });
}

/** DELETE /pro/admin/support/tickets/{id} —— 删除工单（官方 support.ts L55-57） */
export function deleteAdminTicketApi(id: string): Promise<unknown> {
    return request<unknown>(`/api/admin/support/tickets/${encodeURIComponent(id)}`, { method: "DELETE" });
}
