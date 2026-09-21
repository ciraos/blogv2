
// ===================== 朋友圈 / Moments（PRO）相关类型 =====================
// 依据：Apifox 文档 + 线上实测（/pro/moments）

// 通用顶层响应
export interface ApiResponse<T> {
    code: number;
    message: string;
    data: T;
}

// 朋友圈统计
export interface MomentsStatistics {
    total_links: number;
    active_links: number;
    total_moments: number;
    last_updated_time: string;
}

// 单条朋友圈（友链 RSS 聚合文章）
export interface MomentItem {
    id: number;
    link_id: number;
    link_name: string;
    link_logo: string;
    link_url: string;
    post_title: string;
    post_url: string;
    post_summary: string;
    published_at: string;
    created_at: string;
}

// 朋友圈列表分页 data
export interface MomentsListData {
    list: MomentItem[];
    page: number;
    page_size: number;
    total: number;
    statistics: MomentsStatistics;
}

// 列表请求参数
export interface MomentsListParams {
    page?: number;
    page_size?: number;
    /** 排序方式：published_at（发布时间）/ created_at（抓取时间） */
    sort_type?: "published_at" | "created_at";
}

// 随机一篇文章（GET /pro/moments/randompost 返回；友链鱼塘用）
export interface RandomMomentPost {
    /** 来源友链名 */
    author: string;
    /** 来源站点头像 */
    avatar: string;
    /** 原文链接 */
    link: string;
    /** 文章标题 */
    title: string;
    /** 创建时间（字符串，如 2026-03-11 02:46:25） */
    created: string;
    /** 更新时间 */
    updated: string;
}

export type MomentsListResponse = ApiResponse<MomentsListData>;

// ===================== 后台朋友圈管理（PRO，需登录 + 管理员） =====================
// 依据：线上官方后台 /admin/moments 的前端实现（它调用 /api/pro/admin/moments 系列）

/** 管理端单条朋友圈：比公开接口多 author / guid / fetched_at */
export interface AdminMomentItem extends MomentItem {
    /** 原文作者（公开接口不返回） */
    author?: string;
    /** RSS GUID，去重标识（公开接口不返回） */
    guid?: string;
    /** RSS 抓取时间（公开接口不返回） */
    fetched_at?: string;
}

/** 管理端排序字段（与官方后台下拉框取值一致） */
export type MomentSortBy = "published_at" | "created_at" | "fetched_at" | "link_name" | "post_title";

/** 管理端排序方向 */
export type MomentSortOrder = "asc" | "desc";

/** 后台朋友圈列表请求参数（page / page_size 必传） */
export interface AdminMomentsListParams {
    page?: number;
    page_size?: number;
    /** 关键词搜索（官方在空串时不传） */
    keyword?: string;
    /** 按友链筛选，仅 > 0 时生效 */
    link_id?: number;
    sort_by?: MomentSortBy;
    sort_order?: MomentSortOrder;
}

/** 后台朋友圈列表 data */
export interface AdminMomentsListData {
    list: AdminMomentItem[];
    page: number;
    page_size: number;
    total: number;
    statistics?: MomentsStatistics;
}

/** 更新朋友圈（PUT /pro/admin/moments/{id}）请求体 */
export interface AdminMomentUpdatePayload {
    link_name?: string;
    link_url?: string;
    link_logo?: string;
    post_title?: string;
    post_url?: string;
    post_summary?: string;
    author?: string;
    /** RFC3339 时间字符串 */
    published_at?: string;
}

/** RSS 抓取状态（GET /pro/admin/moments/fetch-status） */
export interface MomentFetchStatus {
    /** 是否正在抓取（为 true 时官方前端每 3s 轮询一次） */
    is_fetching?: boolean;
    /** 状态文案，直接展示 */
    status?: string;
}
