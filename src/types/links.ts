
// ===================== 友情链接相关类型 =====================
// 依据：Apifox 文档 + 线上实测（/public/links 为分页返回）

// 通用顶层响应
export interface ApiResponse<T> {
    code: number;
    message: string;
    data: T;
}

// 友链分类
export interface LinkCategory {
    id: number;
    name: string;
    style: string;
    description: string;
}

// 友链标签
export interface LinkTag {
    id: number;
    name: string;
    color: string;
}

// 单个友链
export interface FriendLink {
    id: number;
    name: string;
    url: string;
    logo: string;
    description: string;
    status: string;
    /** RSS 订阅地址（可选，后端可能不返回该字段） */
    rss?: string;
    siteshot: string;
    email: string;
    sort_order: number;
    skip_health_check: boolean;
    category: LinkCategory | null;
    tag: LinkTag | null;
}

// 友链列表分页 data
export interface LinkListData {
    list: FriendLink[];
    total: number;
    page: number;
    pageSize: number;
}

/**
 * 友链页分区：一个分类 + 该分类下的友链。
 * 配合「按分类展示全部友链」的口径 —— links 含状态为 INVALID（已失联）的友链，
 * 因此计数等于该分类的总条数，而不是其中「已通过」的条数。
 */
export interface LinkCategoryGroup {
    category: LinkCategory;
    links: FriendLink[];
}

// 友链列表请求参数
export interface LinkListParams {
    category_id?: number | string;
    tag_id?: number | string;
    page?: number;
    pageSize?: number;
}

export type LinkListResponse = ApiResponse<LinkListData>;

/** 创建友链请求体（POST /links，管理员） */
export interface AdminCreateLinkRequest {
    name: string;
    url: string;
    logo?: string;
    description?: string;
    /** RSS 订阅地址（可选） */
    rss?: string;
    /** 网站快照地址（可选，后端若自动生成快照可忽略此字段） */
    siteshot?: string;
    /** 后端枚举：PENDING / APPROVED / REJECTED / INVALID */
    status?: string;
    email?: string;
    sort_order?: number;
    skip_health_check?: boolean;
    category_id?: number;
    tag_id?: number;
}

/** 更新友链请求体（PUT /links/{id}，管理员） */
export interface AdminUpdateLinkRequest {
    name?: string;
    url?: string;
    logo?: string;
    description?: string;
    /** 后端枚举：PENDING / APPROVED / REJECTED / INVALID */
    status?: string;
    /** RSS 订阅地址（可选） */
    rss?: string;
    /** 网站快照地址（可选，后端若自动生成快照可忽略此字段） */
    siteshot?: string;
    email?: string;
    sort_order?: number;
    skip_health_check?: boolean;
    category_id?: number;
    tag_id?: number;
}
