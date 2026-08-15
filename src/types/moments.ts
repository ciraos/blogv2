
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

export type MomentsListResponse = ApiResponse<MomentsListData>;
