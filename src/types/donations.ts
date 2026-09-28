// ===================== 打赏名单（PRO）相关类型 =====================
// 依据：官方主题 theme-anheyu-next 的 src/types/donation.ts。
// 后端把打赏放在闭源的 PRO 模块里（OSS 仓库的 swagger 与 Go 源码都不含打赏接口），
// 所以字段以官方前端的类型定义为准；接口路径已用线上探活核对过。

// 通用顶层响应
export interface ApiResponse<T> {
    code: number;
    message: string;
    data: T;
}

/** 打赏状态：1=显示（前台打赏名单里展示） 2=隐藏 */
export enum DonationStatus {
    VISIBLE = 1,
    HIDDEN = 2,
}

/** 单条打赏记录 */
export interface Donation {
    id: number;
    /** 打赏者昵称 */
    name: string;
    /** 金额 */
    amount: number;
    /** 金额后缀（默认「元」） */
    suffix: string;
    /** 状态：1=显示 2=隐藏 */
    status: number;
    /** 排序值，越小越靠前 */
    sort_order: number;
    /** 自定义发布时间（可空；展示时优先于 created_at） */
    custom_published_at?: string;
    created_at: string;
    updated_at: string;
}

// 列表分页 data（注意：分页参数名是 page_size，不是 pageSize）
export interface DonationListData {
    list: Donation[];
    page: number;
    page_size: number;
    total: number;
}

/** 管理端列表请求参数 */
export interface AdminDonationListParams {
    page?: number;
    page_size?: number;
    /** 状态筛选：1=显示 2=隐藏 */
    status?: number;
}

/** 打赏总额（GET /pro/donations/total） */
export interface DonationTotalData {
    total_amount: number;
}

/** 新增打赏请求体（POST /pro/admin/donations） */
export interface AdminCreateDonationRequest {
    name: string;
    amount: number;
    suffix?: string;
    status?: number;
    sort_order?: number;
    /** 自定义发布时间（datetime-local 的 'YYYY-MM-DDTHH:mm' 字符串） */
    custom_published_at?: string;
}

/** 更新打赏请求体（PUT /pro/admin/donations/{id}） */
export interface AdminUpdateDonationRequest {
    name?: string;
    amount?: number;
    suffix?: string;
    status?: number;
    sort_order?: number;
    custom_published_at?: string;
}

export type DonationListResponse = ApiResponse<DonationListData>;
