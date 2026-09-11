
// ===================== 文章相关类型 =====================
// 依据：Apifox 文档（llms.txt + 各接口 OpenAPI）+ 线上接口实测
// 注意：post_tags / post_categories 实测为对象数组（PostTag/PostCategory），
//       与最初文档示例中的 string[] 不同，以线上返回为准。

// 通用基础响应
export interface ApiResponse<T> {
    code: number;
    message: string;
    data: T;
}

// 分页 data 主体
export interface PostListData {
    list: PostItem[];
    total: number;
    page: number;
    pageSize: number;
}

// 文章标签
export interface PostTag {
    id: string;
    created_at: string;
    updated_at: string;
    name: string;
    slug: string;
    count: number;
}

// 文章分类
export interface PostCategory {
    id: string;
    created_at: string;
    updated_at: string;
    name: string;
    slug: string;
    description: string;
    count: number;
    is_series: boolean;
    sort_order: number;
}

// 单篇文章（列表项）
export interface PostItem {
    id: string;
    created_at: string;
    updated_at: string;
    title: string;
    cover_url: string;
    status: "PUBLISHED" | "DRAFT" | "ARCHIVED";
    view_count: number;
    word_count: number;
    reading_time: number;
    ip_location: string;
    primary_color: string;
    is_primary_color_manual: boolean;
    show_on_home: boolean;
    post_tags: PostTag[];
    post_categories: PostCategory[];
    home_sort: number;
    pin_sort: number;
    top_img_url: string;
    summaries: string[];
    abbrlink: string;
    copyright: boolean;
    is_reprint: boolean;
    copyright_author: string;
    copyright_author_href: string;
    copyright_url: string;
    keywords: string;
    comment_count: number;
}

// 上一篇 / 下一篇 / 相关文章（简化信息）
export interface SimpleArticle {
    id: string;
    title: string;
    abbrlink: string;
    cover_url: string;
    created_at: string;
}

// 文章详情（在列表项基础上追加正文与上下文）
export interface ArticleDetail extends PostItem {
    content_md: string;
    content_html: string;
    prev_article: SimpleArticle | null;
    next_article: SimpleArticle | null;
    related_articles: SimpleArticle[];
    review_status: string;
    owner_id: number;
    owner_nickname: string;
    owner_avatar: string;
    owner_email: string;
}

// 接口完整返回类型
export type PostListResponse = ApiResponse<PostListData>;
export type ArticleDetailResponse = ApiResponse<ArticleDetail>;

// ===================== 管理员 =====================

/** 管理员文章列表请求参数（GET /articles，分页） */
export interface AdminArticleListParams {
    page?: number;
    pageSize?: number;
    /** 标题关键字搜索（后端字段名待确认，非必需时可省略） */
    keyword?: string;
    /** 文章状态：PUBLISHED / DRAFT / ARCHIVED；「定时发布」后端值待确认（暂用 SCHEDULED） */
    status?: string;
    /** 审核状态：PENDING / APPROVED / REJECTED（字段名/枚举待确认） */
    review_status?: string;
    /** 分类 ID 筛选 */
    category_id?: number | string;
    /** 标签 ID 筛选 */
    tag_id?: number | string;
}

// ===================== 归档 =====================

// 归档条目（按年月分组统计）
export interface ArchiveItem {
    year: number;
    month: number;
    count: number;
}

// 归档摘要响应 data
export interface ArchiveSummary {
    list: ArchiveItem[];
}

export type ArchiveSummaryResponse = ApiResponse<ArchiveSummary>;
