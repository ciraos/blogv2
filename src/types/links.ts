
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

// 友链列表请求参数
export interface LinkListParams {
    category_id?: number | string;
    tag_id?: number | string;
    page?: number;
    pageSize?: number;
}

export type LinkListResponse = ApiResponse<LinkListData>;
