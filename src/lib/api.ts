// 后端 API 客户端：统一处理 Bearer 鉴权、JSON 解析与错误
//
// 注意：后端不开放 CORS，浏览器不能直连远端 API。
// 所有需要从客户端发起的请求（如登录）都必须走本应用同源的 /api/* 路由，
// 由服务端转发到远端。服务端组件（Server Components）可直接调用远端接口。
import type { ArchiveSummary, ArticleDetail, PostItem, PostListData } from "@/types/articles";
import type { LoginData, LoginUserInfo } from "@/types/auth";
import type { FriendLink, LinkCategory, LinkListData, LinkListParams } from "@/types/links";
import type { AdminEssayListParams, Essay, EssayListData } from "@/types/essays";

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
    return all;
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
