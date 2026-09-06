
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
