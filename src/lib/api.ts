// 后端 API 客户端：统一处理 Bearer 鉴权、JSON 解析与错误
//
// 注意：后端不开放 CORS，浏览器不能直连远端 API。
// 所有需要从客户端发起的请求（如登录）都必须走本应用同源的 /api/* 路由，
// 由服务端转发到远端。服务端组件（Server Components）可直接调用远端接口。
import type { ArchiveSummary, ArticleDetail, PostItem, PostListData } from "@/types/articles";
import type { LoginData, LoginUserInfo } from "@/types/auth";
import type { FriendLink, LinkCategory, LinkListData, LinkListParams } from "@/types/links";
import type { AdminEssayListParams, Essay, EssayListData } from "@/types/essays";
import type { MomentsListData, MomentsListParams } from "@/types/moments";
import type { SiteConfig } from "@/types/site-config";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export class ApiError extends Error {
    status: number;
    code: number;

    constructor(message: string, status: number, code: number) {
        super(message);
        this.name = "ApiError";
        this.status = status;
        this.code = code;
    }
}

interface ApiResponse<T> {
    code: number;
    message: string;
    data: T;
}

async function request<T>(path: string, options: RequestInit = {}, token?: string | null): Promise<T> {
    const headers = new Headers(options.headers);
    if (options.body && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
    }
    if (token) {
        headers.set("Authorization", `Bearer ${token}`);
    }

    // 以 /api/ 开头的路径是本站同源路由（相对地址，原样使用），
    // 其余路径拼接远端 API 前缀（服务端调用，无 CORS 问题）
    const isLocalRoute = path.startsWith("/api/");
    const url = isLocalRoute ? path : `${API_URL}${path}`;

    let res: Response;
    try {
        res = await fetch(url, { ...options, headers, cache: "no-store" });
    } catch {
        throw new ApiError("网络请求失败，请检查网络连接", 0, 0);
    }

    let json: ApiResponse<T> | null = null;
    try {
        json = (await res.json()) as ApiResponse<T>;
    } catch {
        // 非 JSON 响应
    }

    // 成功：HTTP 2xx 且业务 code 为 200（部分接口示例为 0）
    if (res.ok && json && (json.code === 200 || json.code === 0)) {
        return json.data;
    }

    throw new ApiError(json?.message || `请求失败（HTTP ${res.status}）`, res.status, json?.code ?? res.status);
}

/**
 * POST /api/auth/login（本应用同源路由，服务端转发到远端 /auth/login）
 * 登录成功后由路由设置 httpOnly cookie，客户端无需保存 token。
 */
export async function loginApi(email: string, password: string): Promise<void> {
    await request<unknown>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
    });
}

/**
 * POST /api/auth/register（本应用同源路由，服务端转发到远端 /auth/register）
 * 注意：后端要求 nickname 必填（文档未列全），注册成功后不会自动登录。
 */
export async function registerApi(nickname: string, email: string, password: string, repeatPassword: string): Promise<void> {
    await request<unknown>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ nickname, email, password, repeat_password: repeatPassword }),
    });
}

/** POST /auth/activate 激活用户账号（仅限服务端调用；参数来自激活链接） */
export async function activateApi(publicUserId: string, sign: string): Promise<void> {
    await request<unknown>("/auth/activate", {
        method: "POST",
        body: JSON.stringify({ publicUserId, sign }),
    });
}

/** POST /auth/refresh 刷新访问令牌（仅限服务端调用） */
export function refreshTokenApi(refreshToken: string): Promise<LoginData> {
    return request<LoginData>("/auth/refresh", {
        method: "POST",
        body: JSON.stringify({ refreshToken }),
    });
}

/** GET /user/info 获取当前用户信息（需鉴权，服务端调用） */
export function getUserInfoApi(token: string): Promise<LoginUserInfo> {
    return request<LoginUserInfo>("/user/info", { method: "GET" }, token);
}

// ===================== 统计数据 =====================

export interface BasicStatistics {
    today_visitors: number;
    today_views: number;
    yesterday_visitors: number;
    yesterday_views: number;
    month_views: number;
    year_views: number;
}

/** GET /public/statistics/basic 基础统计数据 */
export function getBasicStatisticsApi(): Promise<BasicStatistics> {
    return request<BasicStatistics>("/public/statistics/basic", { method: "GET" });
}

// ===================== 文章 =====================

export interface PublicArticlesParams {
    page?: number;
    pageSize?: number;
    category?: string;
    tag?: string;
    year?: number;
    month?: number;
}

/** GET /public/articles 前台文章列表（分页，按置顶+创建时间排序） */
export async function getPublicArticlesApi(params: PublicArticlesParams = {}): Promise<PostListData> {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== "") {
            qs.set(key, String(value));
        }
    }
    const query = qs.toString();
    return request<PostListData>(`/public/articles${query ? `?${query}` : ""}`, { method: "GET" });
}

/** GET /public/articles/{id} 前台文章详情（公共ID 或 Abbrlink） */
export function getPublicArticleApi(id: string): Promise<ArticleDetail> {
    return request<ArticleDetail>(`/public/articles/${encodeURIComponent(id)}`, { method: "GET" });
}

/** GET /public/articles/random 随机获取一篇文章（无已发布文章时 404） */
export function getRandomArticleApi(): Promise<ArticleDetail> {
    return request<ArticleDetail>("/public/articles/random", { method: "GET" });
}

/** GET /public/articles/archives 归档摘要（按年月分组统计） */
export function getPublicArchivesApi(): Promise<ArchiveSummary> {
    return request<ArchiveSummary>("/public/articles/archives", { method: "GET" });
}

/**
 * 拉取全部公开文章（用于聚合分类/标签）。
 * 分页遍历 /public/articles，按 total 或上限停止，按 id 去重。
 */
export async function getAllPublicArticlesApi(maxPages = 20): Promise<PostItem[]> {
    const pageSize = 50;
    const all: PostItem[] = [];
    const seen = new Set<string>();

    for (let page = 1; page <= maxPages; page++) {
        const data = await getPublicArticlesApi({ page, pageSize });
        for (const item of data.list) {
            if (!seen.has(item.id)) {
                seen.add(item.id);
                all.push(item);
            }
        }
        if (data.list.length === 0 || all.length >= data.total || all.length >= maxPages * pageSize) {
            break;
        }
    }
    return all;
}

// ===================== 友情链接 =====================

/** GET /public/link-categories 公开友链分类列表（包含已批准友链的分类） */
export function getPublicLinkCategoriesApi(): Promise<LinkCategory[]> {
    return request<LinkCategory[]>("/public/link-categories", { method: "GET" });
}

/** GET /public/links 公开友链列表（分页，支持按分类/标签筛选） */
export async function getPublicLinksApi(params: LinkListParams = {}): Promise<LinkListData> {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== "") {
            qs.set(key, String(value));
        }
    }
    const query = qs.toString();
    return request<LinkListData>(`/public/links${query ? `?${query}` : ""}`, { method: "GET" });
}

/** 拉取某分类下的全部友链（分页遍历，按 total 停止） */
export async function getLinksByCategoryApi(categoryId: number): Promise<FriendLink[]> {
    const pageSize = 50;
    const all: FriendLink[] = [];
    const seen = new Set<number>();

    for (let page = 1; page <= 10; page++) {
        const data = await getPublicLinksApi({ category_id: categoryId, page, pageSize });
        for (const link of data.list) {
            if (!seen.has(link.id)) {
                seen.add(link.id);
                all.push(link);
            }
        }
        if (data.list.length === 0 || all.length >= data.total) {
            break;
        }
    }
    // 后端不提供排序参数（固定 id 升序 = 先添加在前）。
    // 新添加的友链 id 更大，前端按 id 降序排列，让新友链排在最前。
    return all.sort((a, b) => b.id - a.id);
}

/** GET /public/links/random 随机获取友链（num=0 表示全部） */
export async function getPublicLinksRandomApi(num = 1): Promise<FriendLink[]> {
    return request<FriendLink[]>(`/public/links/random?num=${num}`, { method: "GET" });
}

/** 管理员友链列表请求参数（GET /api/admin/links，客户端经同源代理） */
export interface AdminLinkListParams {
    page?: number;
    pageSize?: number;
    keyword?: string;
    status?: string;
    category_id?: number | string;
    tag_id?: number | string;
}

/** GET /api/admin/links 管理员获取友链列表（分页，浏览器自动携带登录 cookie） */
export async function getAdminLinksApi(params: AdminLinkListParams = {}): Promise<LinkListData> {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== "") {
            qs.set(key, String(value));
        }
    }
    const query = qs.toString();
    return request<LinkListData>(`/api/admin/links${query ? `?${query}` : ""}`, { method: "GET" });
}

/** 友链申请提交数据（POST /public/links） */
export interface LinkApplyPayload {
    name: string;
    url: string;
    logo: string;
    description: string;
    siteshot?: string;
    email?: string;
    rss?: string;
}

/** POST /api/public/links 提交友链申请（本应用同源代理，客户端调用；等待管理员审核） */
export async function submitLinkApplyApi(payload: LinkApplyPayload): Promise<unknown> {
    return request<unknown>("/api/public/links", {
        method: "POST",
        body: JSON.stringify(payload),
    });
}

// ===================== 即刻 / 说说（PRO） =====================

/**
 * GET /pro/admin/essays 管理后台即刻列表（需鉴权）
 * 参数：page（默认 1）、page_size（默认 20）、status（1=发布 2=草稿 3=隐藏）
 */
export async function getAdminEssaysApi(token: string, params: AdminEssayListParams = {}): Promise<EssayListData> {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        // 参数均为 number，只跳过 undefined/null
        if (value !== undefined && value !== null) {
            qs.set(key, String(value));
        }
    }
    const query = qs.toString();
    return request<EssayListData>(`/pro/admin/essays${query ? `?${query}` : ""}`, { method: "GET" }, token);
}

/** GET /pro/admin/essays/{id} 即刻详情（需鉴权） */
export function getAdminEssayApi(token: string, id: number): Promise<Essay> {
    return request<Essay>(`/pro/admin/essays/${id}`, { method: "GET" }, token);
}

/** GET /pro/essays 前台即刻列表（公开，无需鉴权；实测路径，文档中的 /pro/public/essays 在本部署为 404） */
export async function getPublicEssaysApi(params: { page?: number; page_size?: number } = {}): Promise<EssayListData> {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
            qs.set(key, String(value));
        }
    }
    const query = qs.toString();
    return request<EssayListData>(`/pro/essays${query ? `?${query}` : ""}`, { method: "GET" });
}

/** GET /pro/moments 朋友圈/RSS 聚合文章列表（公开；实测路径，文档中的 /pro/public/moments 在本部署为 404） */
export async function getPublicMomentsApi(params: MomentsListParams = {}): Promise<MomentsListData> {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
            qs.set(key, String(value));
        }
    }
    const query = qs.toString();
    return request<MomentsListData>(`/pro/moments${query ? `?${query}` : ""}`, { method: "GET" });
}

/** GET /public/site-config 站点公开配置（服务端调用） */
export function getPublicSiteConfigApi(): Promise<SiteConfig> {
    return request<SiteConfig>("/public/site-config", { method: "GET" });
}

// ===================== 站点统计 =====================

export interface BasicStats {
    today_visitors: number;
    today_views: number;
    yesterday_visitors: number;
    yesterday_views: number;
    month_views: number;
    year_views: number;
}

/** GET /public/statistics/basic 站点访问统计（今日/昨日/本月/年度） */
export function getPublicBasicStatsApi(): Promise<BasicStats> {
    return request<BasicStats>("/public/statistics/basic", { method: "GET" });
}

// ===================== 评论 =====================

export interface RecentComment {
    id: string;
    created_at: string;
    nickname: string;
    website: string;
    email_md5: string;
    /** 头像完整 URL（子评论接口直接返回；父评论可能为空，需用 email_md5 拼） */
    avatar_url?: string;
    content_html: string;
    content: string;
    is_admin_comment: boolean;
    is_anonymous: boolean;
    ip_location: string;
    target_path: string;
    target_title: string;
    like_count: number;
    total_children: number;
    /** 子评论字段：父评论 id */
    parent_id?: string;
    /** 子评论字段：被回复的评论 id */
    reply_to_id?: string;
    /** 子评论字段：被回复者昵称 */
    reply_to_nick?: string;
}

export interface CommentListData {
    list: RecentComment[];
    page: number;
    pageSize: number;
    total: number;
    total_with_children: number;
}

/** GET /public/comments/latest 全站最新已发布评论（公开，分页） */
export async function getLatestCommentsApi(params: { page?: number; pageSize?: number } = {}): Promise<CommentListData> {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
            qs.set(key, String(value));
        }
    }
    const query = qs.toString();
    return request<CommentListData>(`/public/comments/latest${query ? `?${query}` : ""}`, { method: "GET" });
}

/**
 * GET /public/comments 按目标路径获取评论列表（公开）
 * @param params target_path 必需；page / pageSize 可选
 */
export async function getCommentsByPathApi(params: {
    target_path: string;
    page?: number;
    pageSize?: number;
}): Promise<CommentListData> {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
            qs.set(key, String(value));
        }
    }
    const query = qs.toString();
    return request<CommentListData>(`/public/comments${query ? `?${query}` : ""}`, { method: "GET" });
}

/** GET /public/comments/{id}/children 获取某条评论的子评论（博主回复等，公开） */
export async function getCommentChildrenApi(
    id: string,
    params: { page?: number; pageSize?: number } = {},
): Promise<CommentListData> {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
            qs.set(key, String(value));
        }
    }
    const query = qs.toString();
    return request<CommentListData>(`/public/comments/${encodeURIComponent(id)}/children${query ? `?${query}` : ""}`, {
        method: "GET",
    });
}

/** 带子评论的评论（父评论 + 博主回复等） */
export interface CommentWithChildren extends RecentComment {
    children: RecentComment[];
}

/**
 * 获取某目标路径的评论（含子评论），供评论区组件使用。
 * 失败时降级为空数组，不抛出。
 */
export async function getCommentsWithChildrenApi(
    targetPath: string,
    params: { page?: number; pageSize?: number } = {},
): Promise<CommentWithChildren[]> {
    const { page = 1, pageSize = 20 } = params;
    try {
        const commentData = await getCommentsByPathApi({ target_path: targetPath, page, pageSize });
        const parents = commentData.list ?? [];
        // 并行拉取有子评论的评论（total_children > 0）
        const childrenResults = await Promise.all(
            parents.map(async (parent) => {
                if ((parent.total_children ?? 0) <= 0) return [] as RecentComment[];
                try {
                    const childData = await getCommentChildrenApi(parent.id, { page: 1, pageSize: 20 });
                    return childData.list ?? [];
                } catch {
                    return [] as RecentComment[];
                }
            }),
        );
        return parents.map((parent, i) => ({ ...parent, children: childrenResults[i] ?? [] }));
    } catch {
        return [];
    }
}

// ===================== 公开页面 =====================

export interface PublicPage {
    id: number;
    path: string;
    title: string;
    description: string;
    content: string;
    markdown_content: string;
    is_published: boolean;
    show_comment: boolean;
    sort: number;
    created_at: string;
    updated_at: string;
}

/** GET /public/pages/{path} 根据路径获取已发布的页面详情（公开）。path 如 /privacy，自动去前导斜杠 */
export async function getPublicPageApi(path: string): Promise<PublicPage> {
    const clean = path.replace(/^\/+/, "");
    return request<PublicPage>(`/public/pages/${encodeURIComponent(clean)}`, { method: "GET" });
}

// ===================== 相册 ALBUM =====================

/** 公开相册分类 */
export interface AlbumCategory {
    id: number;
    name: string;
    description?: string;
    cover?: string;
    sort?: number;
}

/** 相册图片项（实测 /public/albums 返回图片墙：imageUrl 为访问路径） */
export interface Album {
    id: number;
    created_at: string;
    updated_at: string;
    imageUrl: string;
    bigImageUrl: string;
    downloadUrl?: string;
    thumbParam?: string;
    bigParam?: string;
    tags?: string;
    viewCount?: number;
    downloadCount?: number;
    width?: number;
    height?: number;
    fileSize?: number;
    format?: string;
    aspectRatio?: string;
    fileHash?: string;
    displayOrder?: number;
    categoryId?: number;
    title?: string;
    description?: string;
    location?: string;
    published_at?: string | null;
}

/** 相册列表分页 data（实测 /public/albums） */
export interface AlbumListData {
    list: Album[];
    pageNum: number;
    pageSize: number;
    total: number;
}

/** GET /public/album-categories 公开相册分类列表 */
export function getPublicAlbumCategoriesApi(): Promise<AlbumCategory[]> {
    return request<AlbumCategory[]>("/public/album-categories", { method: "GET" });
}

/** GET /public/albums 公开相册列表（分页） */
export async function getPublicAlbumsApi(params: { page?: number; pageSize?: number } = {}): Promise<AlbumListData> {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
            qs.set(key, String(value));
        }
    }
    const query = qs.toString();
    return request<AlbumListData>(`/public/albums${query ? `?${query}` : ""}`, { method: "GET" });
}
