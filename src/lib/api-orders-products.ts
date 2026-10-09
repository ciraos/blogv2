// 后台 PRO 模块**浏览器端 API 客户端**：订单管理 与 商品管理 两个页面共用。
//
// 为什么另开文件而不是塞进 src/lib/api.ts：
//   · api.ts 里的 request() 没有导出（本轮不允许改 api.ts），而这两个模块全部走
//     「PRO 闭源接口 + 同源代理」的路径，与 api.ts 里已有的写法完全一致；
//   · 这里自带一份等价的 request 助手，失败时抛下面的 AdminCatalogApiError（字段与 api.ts 的 ApiError 对齐）。
//
// 浏览器端不直连后端（后端不开放 CORS 且需鉴权），统一请求本站同源代理 /api/admin/*，
// 由代理读取 httpOnly cookie 里的 token 转发到远端 /pro/admin/*（见 src/app/api/admin/{orders,products,variants,stock}/）。
//
// 权威来源（官方前端快照 scripts/theme/theme-anheyu-next-main）：
//   · src/lib/api/order.ts
//       L13-15  GET    /api/pro/admin/orders                列表（已接，走 api.ts 的 getAdminOrdersApi）
//       L20-22  POST   /api/pro/admin/orders/list           带筛选的列表（body = OrderListParams）
//       L27-29  DELETE /api/pro/admin/orders/{id}           **软删除**（后端无「关闭 / 退款」接口）
//   · src/lib/api/product.ts
//       L23-25  GET    /api/pro/admin/products              列表（已接，走 api.ts 的 getAdminProductsApi）
//       L30-32  GET    /api/pro/admin/products/{id}         详情（含 variants）
//       L37-39  POST   /api/pro/admin/products              新增
//       L44-46  PUT    /api/pro/admin/products/{id}         更新（**上下架 / 首页展示 = 只传 status / show_on_homepage**）
//       L51-53  DELETE /api/pro/admin/products/{id}         删除
//       L58-60  DELETE /api/pro/admin/variants/{id}         删除型号（官方 UI 未使用，语义按 REST 约定推断）
//       L65-67  POST   /api/pro/admin/variants/{id}/stock/import   导入卡密
//       L72-74  GET    /api/pro/admin/variants/{id}/stock          卡密列表
//       L79-81  POST   /api/pro/admin/stock/{id}/invalidate        作废卡密
//   · src/types/product.ts L1-160（字段 / 请求体形状）；src/types/order.ts L1-54
//   · src/app/admin/products/_components/ProductEditDialog.tsx（表单字段）、StockManageDialog.tsx（库存弹窗行为）
//
// ⚠️ 所有写操作（POST / PUT / DELETE）本轮**只实现、不实测**：线上只做过只读 GET 探测（401），
//    真实请求体字段名以官方前端源码为准，未能用真实响应反证。

import type { AdminOrder, AdminOrderListParams } from "@/types/orders";

/** 与 api.ts 同名的错误类型（api.ts 未导出，这里做等价实现，避免跨文件耦合实现细节） */
export class AdminCatalogApiError extends Error {
    status: number;
    code: number;

    constructor(message: string, status: number, code: number) {
        super(message);
        this.name = "AdminCatalogApiError";
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
        throw new AdminCatalogApiError("网络请求失败，请检查网络连接", 0, 0);
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

    // 代理层自己的错误信封（未登录 401 / 参数校验 400 / 无法连接后端 502）也走这里
    throw new AdminCatalogApiError(
        json?.message || `请求失败（HTTP ${res.status}）`,
        res.status,
        json?.code ?? res.status
    );
}

// ============================================================
// 一、通用小工具（纯函数；下面的「请求体校验」也依赖它们）
// ============================================================

/** 是否是「纯对象」（排除 null / 数组 / 其它原始值） */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string {
    return typeof value === "string" ? value : "";
}

function asOptionalString(value: unknown): string | undefined {
    return typeof value === "string" && value !== "" ? value : undefined;
}

function asNumber(value: unknown, fallback = 0): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function asOptionalNumber(value: unknown): number | undefined {
    if (value === undefined || value === null || value === "") return undefined;
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
}

function asId(value: unknown): string | number | undefined {
    return typeof value === "string" || typeof value === "number" ? value : undefined;
}

/**
 * 摊平「列表外壳」：兼容 `{ list }` / `{ data: { list } }` / `data` 直接是数组 三种形状。
 *
 * 为什么需要：写操作与部分读接口本轮不能实测（线上只读探测一律 401），
 * 后端到底把数组放在哪一层没有实据，这里把三种常见形状都兼容掉（字段名仍以官方类型为准）。
 */
function unwrapItems(raw: unknown, key: string): { items: unknown[]; box: Record<string, unknown> } {
    const outer: unknown = isPlainObject(raw) && isPlainObject(raw.data) ? raw.data : raw;
    if (Array.isArray(outer)) return { items: outer, box: {} };
    const box = isPlainObject(outer) ? outer : {};
    const value = box[key];
    return { items: Array.isArray(value) ? value : [], box };
}

// ============================================================
// 二、订单（远端 /pro/admin/*，官方 order.ts）
// ============================================================

/**
 * 订单详情（官方 types/order.ts L25-47 AdminOrder 的全字段）。
 * 比列表项多出的字段（user_id / 关联对象 id / client_ip / user_agent / expire_time / updated_at）
 * 只有详情接口会给，所以列表行只当兜底数据用。
 */
export interface AdminOrderDetail {
    id: number;
    order_no: string;
    order_type: string;
    user_email: string;
    amount: number;
    currency: string;
    payment_provider: string;
    payment_status: string;
    trade_no: string;
    pay_time?: string;
    expire_time?: string;
    created_at: string;
    updated_at?: string;
    user_id?: string | number;
    article_id?: string;
    share_id?: string;
    product_id?: number;
    variant_id?: number;
    membership_plan_id?: number;
    client_ip?: string;
    user_agent?: string;
}

/** 把列表行（字段更少）当成详情兜底数据（枚举字段在这里放宽成 string，未知值由页面的 label 兜底处理） */
export function orderToDetail(order: AdminOrder): AdminOrderDetail {
    return { ...order };
}

/** 任意响应对象 → 订单详情（字段缺失一律给安全默认值，避免后端字段变化时白屏） */
export function normalizeOrder(raw: unknown): AdminOrderDetail | null {
    if (!isPlainObject(raw)) return null;
    const id = asOptionalNumber(raw.id);
    if (id === undefined) return null;
    return {
        id,
        order_no: asString(raw.order_no),
        order_type: asString(raw.order_type),
        user_email: asString(raw.user_email),
        amount: asNumber(raw.amount),
        currency: asString(raw.currency),
        payment_provider: asString(raw.payment_provider),
        payment_status: asString(raw.payment_status),
        trade_no: asString(raw.trade_no),
        pay_time: asOptionalString(raw.pay_time),
        expire_time: asOptionalString(raw.expire_time),
        created_at: asString(raw.created_at),
        updated_at: asOptionalString(raw.updated_at),
        user_id: asId(raw.user_id),
        article_id: asOptionalString(raw.article_id),
        share_id: asOptionalString(raw.share_id),
        product_id: asOptionalNumber(raw.product_id),
        variant_id: asOptionalNumber(raw.variant_id),
        membership_plan_id: asOptionalNumber(raw.membership_plan_id),
        client_ip: asOptionalString(raw.client_ip),
        user_agent: asOptionalString(raw.user_agent),
    };
}

/**
 * 订单列表响应（官方 OrderListResponse L49-54：{ orders, total, page, size }）。
 * ⚠️ 分页字段是 `size`（不是打赏那种 `page_size`）——与 @/types/orders 的约定一致。
 */
export interface AdminOrderListResult {
    orders: AdminOrderDetail[];
    total: number;
    page: number;
    size: number;
}

/** 列表响应归一化 */
function normalizeOrderList(raw: unknown): AdminOrderListResult {
    const { items, box } = unwrapItems(raw, "orders");
    return {
        orders: items.map(normalizeOrder).filter((item): item is AdminOrderDetail => item !== null),
        total: asNumber(box.total, items.length),
        page: asNumber(box.page, 1),
        size: asNumber(box.size, items.length),
    };
}

/**
 * POST /pro/admin/orders/list —— 带筛选的订单列表（官方 order.ts L20-22）。
 * 语义上是「查询」（不会改动数据），但仍然用 POST + JSON body 传筛选条件。
 */
export async function listAdminOrdersByPostApi(params: AdminOrderListParams = {}): Promise<AdminOrderListResult> {
    const raw = await request<unknown>("/api/admin/orders/list", {
        method: "POST",
        body: JSON.stringify(params),
    });
    return normalizeOrderList(raw);
}

/** DELETE /pro/admin/orders/{id} —— 删除订单（**软删除**，官方 order.ts L27-29） */
export function deleteAdminOrderApi(id: number | string): Promise<unknown> {
    return request<unknown>(`/api/admin/orders/${encodeURIComponent(String(id))}`, { method: "DELETE" });
}

// ============================================================
// 三、商品 / 规格 / 卡密库存（远端 /pro/admin/*，官方 product.ts）
// ============================================================

/** 发货方式（官方 src/types/product.ts L11-14 DeliveryMethod） */
export const DELIVERY_METHODS = ["FIXED_REPLY", "STOCK_ITEM"] as const;
export type DeliveryMethod = (typeof DELIVERY_METHODS)[number];

/** 卡密状态（官方 src/types/product.ts L16-20 StockStatus） */
export const StockStatus = { Available: 1, Used: 2, Invalid: 3 } as const;
export type StockStatusValue = (typeof StockStatus)[keyof typeof StockStatus];

/** 商品规格 / 型号（官方 src/types/product.ts L22-35 ProductVariant） */
export interface AdminProductVariant {
    /** 官方类型写的是 string，但列表里的商品 id 实际是数字，两种都兼容 */
    id: string | number;
    name: string;
    /** ⚠️ 单位是**分**（官方类型注释与 ProductEditDialog「价格（分）」标签，页面展示要 /100） */
    price: number;
    cover_url?: string;
    delivery_method: DeliveryMethod;
    /** 发货方式 = FIXED_REPLY 时用户拿到的固定回复内容 */
    fixed_reply_content?: string;
    /** 发货方式 = STOCK_ITEM 时的可用卡密数（详情接口返回） */
    stock_count?: number;
    sold_count: number;
    /** 1=启用（官方类型里是 number，页面只展示） */
    status: number;
    sort_order: number;
    created_at?: string;
    updated_at?: string;
}

/** 商品详情（官方 src/types/product.ts L37-52 Product） */
export interface AdminProduct {
    id: string | number;
    title: string;
    description?: string;
    description_html?: string;
    cover_url?: string;
    /** ProductStatus：1=草稿 2=已上架 3=已下架 */
    status: number;
    exclude_from_membership: boolean;
    show_on_homepage: boolean;
    sort_order: number;
    total_sales?: number;
    total_revenue?: number;
    variants: AdminProductVariant[];
    created_at: string;
    updated_at: string;
}

/** 卡密库存项（官方 src/types/product.ts L71-79 StockItem） */
export interface AdminStockItem {
    id: string | number;
    variant_id?: string | number;
    content: string;
    /** StockStatus：1=可用 2=已使用 3=已作废 */
    status: number;
    order_id?: number;
    used_at?: string;
    created_at?: string;
}

/** 卡密库存列表响应（官方 ListStockResponse L141-146） */
export interface AdminStockListData {
    list: AdminStockItem[];
    total: number;
    page: number;
    page_size: number;
}

/** 卡密库存列表查询参数（官方 ListStockRequest L135-139） */
export interface AdminStockListParams {
    page?: number;
    page_size?: number;
    status?: StockStatusValue;
}

/** 新增 / 更新商品里的型号（官方 CreateVariantRequest / UpdateVariantRequest，L81-97） */
export interface AdminVariantPayload {
    /** 已有型号带上 id 表示「更新这一条」，不带给后端表示新增 */
    id?: string | number;
    name: string;
    price: number;
    delivery_method: DeliveryMethod;
    fixed_reply_content?: string;
    sort_order?: number;
}

/** 新增 / 更新商品请求体（官方 CreateProductRequest / UpdateProductRequest，L99-119） */
export interface AdminProductPayload {
    title: string;
    description?: string;
    cover_url?: string;
    /** ProductStatus：1=草稿 2=已上架 3=已下架 */
    status?: number;
    exclude_from_membership?: boolean;
    show_on_homepage?: boolean;
    sort_order?: number;
    variants?: AdminVariantPayload[];
}

/** 更新商品请求体：官方 UpdateProductRequest 全部字段可选（上下架只传 { status }） */
export type AdminProductUpdatePayload = Partial<AdminProductPayload>;

/** 导入卡密请求体（官方 ImportStockRequest L148-151） */
export interface AdminImportStockPayload {
    /** 每行一条卡密 */
    items?: string[];
    /** 原始多行文本（官方前端两个都传） */
    item_text?: string;
}

/** 导入卡密响应（官方 ImportStockResponse L153-159，字段名以真实响应为准，全部可选） */
export interface AdminImportStockResult {
    total?: number;
    imported?: number;
    duplicate?: number;
    imported_count?: number;
    failed_count?: number;
    errors?: string[];
}

/** 任意响应对象 → 商品型号（字段缺失给安全默认值） */
export function normalizeVariant(raw: unknown): AdminProductVariant | null {
    if (!isPlainObject(raw)) return null;
    const id = asId(raw.id);
    if (id === undefined) return null;
    const method = asString(raw.delivery_method);
    return {
        id,
        name: asString(raw.name),
        price: asNumber(raw.price),
        cover_url: asOptionalString(raw.cover_url),
        // 未知发货方式原样兜底成「固定回复」，页面用 label 映射 + 原值展示，不会白屏
        delivery_method: (DELIVERY_METHODS as readonly string[]).includes(method)
            ? (method as DeliveryMethod)
            : "FIXED_REPLY",
        fixed_reply_content: asOptionalString(raw.fixed_reply_content),
        stock_count: asOptionalNumber(raw.stock_count),
        sold_count: asNumber(raw.sold_count),
        status: asNumber(raw.status, 1),
        sort_order: asNumber(raw.sort_order),
        created_at: asOptionalString(raw.created_at),
        updated_at: asOptionalString(raw.updated_at),
    };
}

/** 任意响应对象 → 商品详情（兼容 detail 再套一层 { product } 的形状） */
export function normalizeProduct(raw: unknown): AdminProduct | null {
    const source = isPlainObject(raw) && isPlainObject(raw.product) ? raw.product : raw;
    if (!isPlainObject(source)) return null;
    const id = asId(source.id);
    if (id === undefined) return null;
    const rawVariants = Array.isArray(source.variants) ? source.variants : [];
    return {
        id,
        title: asString(source.title),
        description: asOptionalString(source.description),
        description_html: asOptionalString(source.description_html),
        cover_url: asOptionalString(source.cover_url),
        status: asNumber(source.status, 1),
        exclude_from_membership: source.exclude_from_membership === true,
        show_on_homepage: source.show_on_homepage !== false,
        sort_order: asNumber(source.sort_order),
        total_sales: asOptionalNumber(source.total_sales),
        total_revenue: asOptionalNumber(source.total_revenue),
        variants: rawVariants
            .map(normalizeVariant)
            .filter((item): item is AdminProductVariant => item !== null),
        created_at: asString(source.created_at),
        updated_at: asString(source.updated_at),
    };
}

/** 任意响应对象 → 卡密项 */
export function normalizeStockItem(raw: unknown): AdminStockItem | null {
    if (!isPlainObject(raw)) return null;
    const id = asId(raw.id);
    if (id === undefined) return null;
    return {
        id,
        variant_id: asId(raw.variant_id),
        content: asString(raw.content),
        status: asNumber(raw.status, 1),
        order_id: asOptionalNumber(raw.order_id),
        used_at: asOptionalString(raw.used_at),
        created_at: asOptionalString(raw.created_at),
    };
}

/** 库存状态的中文标签（页面与 CSV 共用） */
export function stockStatusLabel(status: number): string {
    if (status === StockStatus.Available) return "可用";
    if (status === StockStatus.Used) return "已使用";
    if (status === StockStatus.Invalid) return "已作废";
    return `未知（${status}）`;
}

/** GET /pro/admin/products/{id} —— 商品详情（官方 product.ts L30-32） */
export async function getAdminProductApi(id: string | number): Promise<AdminProduct> {
    const raw = await request<unknown>(`/api/admin/products/${encodeURIComponent(String(id))}`, { method: "GET" });
    const product = normalizeProduct(raw);
    if (!product) throw new AdminCatalogApiError("商品详情响应格式异常", 200, 200);
    return product;
}

/** POST /pro/admin/products —— 新增商品（官方 product.ts L37-39） */
export function createAdminProductApi(payload: AdminProductPayload): Promise<unknown> {
    return request<unknown>("/api/admin/products", { method: "POST", body: JSON.stringify(payload) });
}

/** PUT /pro/admin/products/{id} —— 更新商品（官方 product.ts L44-46；上下架 = 只传 { status }） */
export function updateAdminProductApi(id: string | number, payload: AdminProductUpdatePayload): Promise<unknown> {
    return request<unknown>(`/api/admin/products/${encodeURIComponent(String(id))}`, {
        method: "PUT",
        body: JSON.stringify(payload),
    });
}

/** DELETE /pro/admin/products/{id} —— 删除商品（官方 product.ts L51-53） */
export function deleteAdminProductApi(id: string | number): Promise<unknown> {
    return request<unknown>(`/api/admin/products/${encodeURIComponent(String(id))}`, { method: "DELETE" });
}

/** DELETE /pro/admin/variants/{id} —— 删除型号（官方 product.ts L58-60） */
export function deleteAdminVariantApi(id: string | number): Promise<unknown> {
    return request<unknown>(`/api/admin/variants/${encodeURIComponent(String(id))}`, { method: "DELETE" });
}

/** GET /pro/admin/variants/{id}/stock —— 卡密库存列表（官方 product.ts L72-74） */
export async function listAdminVariantStockApi(
    variantId: string | number,
    params: AdminStockListParams = {}
): Promise<AdminStockListData> {
    const qs = new URLSearchParams();
    if (params.page !== undefined) qs.set("page", String(params.page));
    if (params.page_size !== undefined) qs.set("page_size", String(params.page_size));
    if (params.status !== undefined) qs.set("status", String(params.status));
    const query = qs.toString();
    const raw = await request<unknown>(
        `/api/admin/variants/${encodeURIComponent(String(variantId))}/stock${query ? `?${query}` : ""}`,
        { method: "GET" }
    );
    const { items, box } = unwrapItems(raw, "list");
    return {
        list: items.map(normalizeStockItem).filter((item): item is AdminStockItem => item !== null),
        total: asNumber(box.total, items.length),
        page: asNumber(box.page, params.page ?? 1),
        page_size: asNumber(box.page_size, params.page_size ?? items.length),
    };
}

/**
 * POST /pro/admin/variants/{id}/stock —— 导入卡密库存。
 * 本代理路径是 /api/admin/variants/{id}/stock，**远端路径是 /stock/import**
 * （官方 product.ts L65-67 写的是 `/api/pro/admin/variants/${variantId}/stock/import`，以官方为准）。
 */
export function importAdminVariantStockApi(
    variantId: string | number,
    payload: AdminImportStockPayload
): Promise<AdminImportStockResult> {
    return request<AdminImportStockResult>(`/api/admin/variants/${encodeURIComponent(String(variantId))}/stock`, {
        method: "POST",
        body: JSON.stringify(payload),
    });
}

/** POST /pro/admin/stock/{id}/invalidate —— 作废卡密（官方 product.ts L79-81，**无 body**） */
export function invalidateAdminStockApi(id: string | number): Promise<unknown> {
    return request<unknown>(`/api/admin/stock/${encodeURIComponent(String(id))}/invalidate`, { method: "POST" });
}

// ============================================================
// 四、代理路由复用的请求体校验（纯函数，无浏览器 API）
//
// 目的：代理层先做参数校验，非法请求本地 400 直接返回，**不转发**给线上后端
// （铁律：写操作绝不能被本地拼错的 body 打到线上）。
// ============================================================

/** 订单状态 / 支付方式 / 订单类型（官方 src/types/order.ts L5-7） */
const ORDER_STATUSES = ["PENDING", "SUCCESS", "FAILED", "CANCELLED", "EXPIRED"] as const;
const PAYMENT_PROVIDERS = ["ALIPAY", "WECHAT", "EPAY", "HUPIJIAO"] as const;
const ORDER_TYPES = ["ARTICLE", "SHARE", "PRODUCT", "MEMBERSHIP"] as const;

/** 订单列表里允许出现的字符串筛选字段（官方 OrderListParams L9-23） */
const ORDER_STRING_FIELDS = [
    "order_no",
    "trade_no",
    "user_email",
    "start_date",
    "end_date",
    "sort_by",
] as const;

/** 商品状态（官方 src/types/product.ts L5-9 ProductStatus） */
const PRODUCT_STATUSES = [1, 2, 3] as const;

/**
 * 代理路径参数校验：非空、长度合理、只含安全字符。
 * 后端 id 可能是数字（订单 / 商品列表）也可能是 uuid（官方类型写 string），
 * 这里不做更细的类型猜测，只拦住空值、超长值和路径穿越字符（避免拼出别的远端端点）。
 */
export function validateProxyId(id: string): string | null {
    if (!id || !id.trim()) return "缺少 id 参数";
    if (id.length > 128) return "id 参数过长";
    if (!/^[A-Za-z0-9._~-]+$/.test(id)) return "id 参数含非法字符";
    return null;
}

/** 订单 id：官方 src/types/order.ts L26 `id: number`，只接受纯数字 */
export function validateOrderId(id: string): string | null {
    const base = validateProxyId(id);
    if (base) return base;
    if (!/^\d+$/.test(id)) return "订单 id 必须是数字";
    return null;
}

/** 校验 POST /api/admin/orders/list 的 body（= OrderListParams，字段名见官方 src/types/order.ts L9-23） */
export function validateOrderListBody(body: unknown): string | null {
    if (!isPlainObject(body)) return "请求体必须是 JSON 对象";

    for (const key of ["page", "page_size", "user_id"] as const) {
        const value = body[key];
        if (value === undefined || value === null) continue;
        const n = Number(value);
        if (!Number.isInteger(n) || n <= 0) return `${key} 必须是正整数`;
    }

    for (const key of ORDER_STRING_FIELDS) {
        const value = body[key];
        if (value === undefined || value === null) continue;
        if (typeof value !== "string") return `${key} 必须是字符串`;
    }

    const enums: [string, readonly string[]][] = [
        ["status", ORDER_STATUSES],
        ["payment_provider", PAYMENT_PROVIDERS],
        ["order_type", ORDER_TYPES],
    ];
    for (const [key, allowed] of enums) {
        const value = body[key];
        if (value === undefined || value === null || value === "") continue;
        if (typeof value !== "string" || !allowed.includes(value)) return `${key} 取值非法`;
    }

    const sortOrder = body.sort_order;
    if (sortOrder !== undefined && sortOrder !== null && sortOrder !== "" && sortOrder !== "asc" && sortOrder !== "desc") {
        return "sort_order 只能是 asc / desc";
    }

    return null;
}

/** 校验单个型号（官方 src/types/product.ts L81-97） */
function validateVariantItem(item: unknown, index: number): string | null {
    if (!isPlainObject(item)) return `variants[${index}] 必须是对象`;
    const name = item.name;
    if (typeof name !== "string" || !name.trim()) return `variants[${index}].name 不能为空`;
    const price = item.price;
    if (typeof price !== "number" || !Number.isFinite(price) || price < 0) {
        return `variants[${index}].price 必须是不小于 0 的数字`;
    }
    const method = item.delivery_method;
    if (typeof method !== "string" || !(DELIVERY_METHODS as readonly string[]).includes(method)) {
        return `variants[${index}].delivery_method 只能是 FIXED_REPLY / STOCK_ITEM`;
    }
    const reply = item.fixed_reply_content;
    if (reply !== undefined && reply !== null && typeof reply !== "string") {
        return `variants[${index}].fixed_reply_content 必须是字符串`;
    }
    const sortOrder = item.sort_order;
    if (sortOrder !== undefined && sortOrder !== null && (typeof sortOrder !== "number" || !Number.isInteger(sortOrder))) {
        return `variants[${index}].sort_order 必须是整数`;
    }
    const id = item.id;
    if (id !== undefined && id !== null && typeof id !== "string" && typeof id !== "number") {
        return `variants[${index}].id 必须是字符串或数字`;
    }
    return null;
}

/**
 * 校验 POST / PUT /api/admin/products[/{id}] 的 body（官方 CreateProductRequest / UpdateProductRequest）。
 * create 模式要求 title 必填；update 模式允许只传部分字段（上下架就是只传 { status }）。
 */
export function validateProductBody(body: unknown, mode: "create" | "update"): string | null {
    if (!isPlainObject(body)) return "请求体必须是 JSON 对象";

    const title = body.title;
    if (mode === "create" || title !== undefined) {
        if (typeof title !== "string" || !title.trim()) return "title 不能为空";
    }

    for (const key of ["description", "cover_url"] as const) {
        const value = body[key];
        if (value !== undefined && value !== null && typeof value !== "string") return `${key} 必须是字符串`;
    }

    for (const key of ["exclude_from_membership", "show_on_homepage"] as const) {
        const value = body[key];
        if (value !== undefined && value !== null && typeof value !== "boolean") return `${key} 必须是布尔值`;
    }

    const status = body.status;
    if (status !== undefined && status !== null) {
        if (typeof status !== "number" || !(PRODUCT_STATUSES as readonly number[]).includes(status)) {
            return "status 只能是 1（草稿）/ 2（已上架）/ 3（已下架）";
        }
    }

    const sortOrder = body.sort_order;
    if (sortOrder !== undefined && sortOrder !== null && (typeof sortOrder !== "number" || !Number.isInteger(sortOrder))) {
        return "sort_order 必须是整数";
    }

    const variants = body.variants;
    if (variants !== undefined && variants !== null) {
        if (!Array.isArray(variants)) return "variants 必须是数组";
        for (const [index, item] of variants.entries()) {
            const error = validateVariantItem(item, index);
            if (error) return error;
        }
    }

    if (mode === "update") {
        const known = [
            "title",
            "description",
            "cover_url",
            "status",
            "exclude_from_membership",
            "show_on_homepage",
            "sort_order",
            "variants",
        ];
        const hasAny = known.some((key) => body[key] !== undefined);
        if (!hasAny) return "请求体里没有任何可更新字段";
    }

    return null;
}

/** 校验 POST /api/admin/variants/{id}/stock 的 body（官方 ImportStockRequest L148-151） */
export function validateImportStockBody(body: unknown): string | null {
    if (!isPlainObject(body)) return "请求体必须是 JSON 对象";

    const items = body.items;
    if (items !== undefined && items !== null) {
        if (!Array.isArray(items)) return "items 必须是数组";
        if (items.length === 0) return "items 至少要有 1 条卡密";
        for (const [index, item] of items.entries()) {
            if (typeof item !== "string" || !item.trim()) return `items[${index}] 必须是非空字符串`;
        }
    }

    const itemText = body.item_text;
    if (itemText !== undefined && itemText !== null && typeof itemText !== "string") {
        return "item_text 必须是字符串";
    }

    const hasItems = Array.isArray(items) && items.length > 0;
    const hasText = typeof itemText === "string" && itemText.trim().length > 0;
    if (!hasItems && !hasText) return "items 与 item_text 至少要提供一个";

    return null;
}
