// ===================== 订单（PRO）相关类型 =====================
// 字段来源：src/components/admin/orders-manager.tsx 里的内联类型（未做任何改动），
// 那里注明字段名与官方前端类型定义 order.ts 对齐。
// 远端路径：后端 PRO 模块 /pro/admin/orders；同源代理 /api/admin/orders（本次新增）。
// 列表响应形状（已线上探活确认）：{ orders, total, page, size }。

/** 订单状态 */
export type OrderStatus = "PENDING" | "SUCCESS" | "FAILED" | "CANCELLED" | "EXPIRED";

/** 订单类型 */
export type OrderType = "ARTICLE" | "SHARE" | "PRODUCT" | "MEMBERSHIP";

/** 支付方式 */
export type PaymentProvider = "ALIPAY" | "WECHAT" | "EPAY" | "HUPIJIAO";

/** 列表项（只保留列表页会用到的字段） */
export interface AdminOrder {
    id: number;
    order_no: string;
    order_type: OrderType;
    user_email: string;
    amount: number;
    currency: string;
    payment_provider: PaymentProvider;
    payment_status: OrderStatus;
    trade_no: string;
    pay_time?: string;
    created_at: string;
}

/**
 * 订单列表响应 data。
 * ⚠️ 分页字段是 `size`（不是打赏那种 `page_size`；请求参数里才叫 `page_size`）。
 */
export interface AdminOrderListData {
    orders: AdminOrder[];
    total: number;
    page: number;
    size: number;
}

/**
 * 订单列表查询参数（对应 orders-manager 的筛选控件）。
 * 注意：状态 / 支付方式 / 订单类型 三个筛选控件未选择时传 undefined（不要传空字符串）。
 */
export interface AdminOrderListParams {
    page?: number;
    page_size?: number;
    /** 订单状态筛选 */
    status?: OrderStatus;
    /** 支付方式筛选 */
    payment_provider?: PaymentProvider;
    /** 订单类型筛选 */
    order_type?: OrderType;
    /** 订单号模糊搜索 */
    order_no?: string;
    /** 第三方交易号模糊搜索 */
    trade_no?: string;
    /** 下单用户邮箱模糊搜索 */
    user_email?: string;
    /** 起始日期（含），如 2025-01-01 */
    start_date?: string;
    /** 结束日期（含），如 2025-01-31 */
    end_date?: string;
    /** 排序字段（后端字段名，未在 manager 里枚举，故留 string） */
    sort_by?: string;
    /** 排序方向 asc / desc */
    sort_order?: "asc" | "desc";
}
