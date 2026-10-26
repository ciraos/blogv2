// 后端 API 客户端：统一处理 Bearer 鉴权、JSON 解析与错误
//
// 注意：后端不开放 CORS，浏览器不能直连远端 API。
// 所有需要从客户端发起的请求（如登录）都必须走本应用同源的 /api/* 路由，
// 由服务端转发到远端。服务端组件（Server Components）可直接调用远端接口。
import type { AdminArticleListParams, ArchiveSummary, ArticleDetail, PostCategory, PostItem, PostListData, PostTag } from "@/types/articles";
import type {
    AdminCommentListData,
    AdminCommentListParams,
    AdminUpdateCommentRequest,
    CommentStatus,
} from "@/types/comments";
import type { LoginUserInfo } from "@/types/auth";
import type { AdminCreateLinkRequest, AdminUpdateLinkRequest, ExportLinksResponse, FriendLink, ImportLinksRequest, ImportLinksResponse, LinkCategory, LinkCategoryGroup, LinkCategoryPayload, LinkListData, LinkListParams, LinkTag, LinkTagPayload } from "@/types/links";
import type { AdminCreateEssayRequest, AdminEssayListParams, AdminUpdateEssayRequest, Essay, EssayListData } from "@/types/essays";
import type {
    AdminMomentItem,
    AdminMomentsListData,
    AdminMomentsListParams,
    AdminMomentUpdatePayload,
    MomentFetchStatus,
    MomentSortBy,
    MomentSortOrder,
    MomentsListData,
    MomentsListParams,
    RandomMomentPost,
} from "@/types/moments";
import type { SiteConfig } from "@/types/site-config";
import type { AdminCreateUserRequest } from "@/types/users";
import type {
    AdminCreateDonationRequest,
    AdminDonationListParams,
    AdminUpdateDonationRequest,
    Donation,
    DonationListData,
    DonationTotalData,
} from "@/types/donations";
import type { AdminOrderListData, AdminOrderListParams } from "@/types/orders";
import type { AdminProductListParams, ProductListData } from "@/types/products";
import type { AdminDocSeriesListParams, DocSeriesListData } from "@/types/doc-series";
import type { StoragePolicyListData } from "@/types/storage-policy";
import type { ThemeListData } from "@/types/themes";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

/**
 * 缓存标签（配合 `request()` 的第 4 个参数与写操作后的 revalidateTag 使用）。
 * 命名统一用「资源名」，需要更细的粒度时再加 `资源:标识` 形式的二级标签。
 */
export const ARTICLES_TAG = "articles";
export const COMMENTS_TAG = "comments";
export const SITE_CONFIG_TAG = "site-config";
export const ESSAYS_TAG = "essays";
export const MOMENTS_TAG = "moments";
export const LINKS_TAG = "links";
export const PAGES_TAG = "pages";
export const STATS_TAG = "stats";

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

/** 后端统一响应信封（pkg/response/response.go） */
export interface ApiResponse<T> {
    code: number;
    message: string;
    data: T;
}

/**
 * 与 ApiResponse 完全同形的别名，供各 `api-*.ts` 模块统一引用。
 * 这些模块原先各自声明了一份同形接口（ApiEnvelope / Envelope / ProxyEnvelope），现在只保留这个名字。
 */
export type ApiEnvelope<T> = ApiResponse<T>;

/**
 * 「可以缓存」的请求参数（交给 Next 的数据缓存）。
 *
 * 为什么需要：`request()` 默认带 `cache: "no-store"`，等于**每次渲染都打一次后端**——
 * 文章列表页一次要打好几个接口，其中还有「最多 20 页 × 50 条」的全站文章聚合。
 * 公开只读接口（文章/评论/站点配置…）完全可以缓存几十秒，由写操作主动失效。
 *
 * 口径：
 *   - 只有**公开只读**接口传这个参数；带 token 的、随机的（随机友链/随机文章）、
 *     用户私有的一律不传，走原来的 no-store；
 *   - `tags` 用于写操作后 `revalidateTag(tag, { expire: 0 })` 精确失效；
 *   - 没有 `tags` 时只按 `revalidate` 自然过期。
 */
export interface RequestCacheOptions {
    /** 秒。到点后下一个请求触发后台刷新（stale-while-revalidate） */
    revalidate?: number;
    /** 缓存标签，供写操作精确失效 */
    tags?: string[];
}

export async function request<T>(
    path: string,
    options: RequestInit = {},
    token?: string | null,
    cacheOptions?: RequestCacheOptions
): Promise<T> {
    const headers = new Headers(options.headers);
    // 统一声明要 JSON：原先 api-plugins.ts 的本地 request 会带这个头，其余副本不带，
    // 合并到公共实现后统一带上（远端是 gin，不校验 Accept，但带上语义更准确）。
    if (!headers.has("Accept")) {
        headers.set("Accept", "application/json");
    }
    // FormData / Blob 不能手动设 Content-Type：前者要让 fetch 自己带 multipart boundary，
    // 后者是原始二进制（如上传分片，由调用方显式指定 application/octet-stream）。
    if (
        options.body &&
        !(options.body instanceof FormData) &&
        !(options.body instanceof Blob) &&
        !headers.has("Content-Type")
    ) {
        headers.set("Content-Type", "application/json");
    }
    if (token) {
        headers.set("Authorization", `Bearer ${token}`);
    }

    // 以 /api/ 开头的路径是本站同源路由（相对地址，原样使用），
    // 其余路径拼接远端 API 前缀（服务端调用，无 CORS 问题）
    const isLocalRoute = path.startsWith("/api/");
    const url = isLocalRoute ? path : `${API_URL}${path}`;

    // 缓存策略：传了 cacheOptions 就交给 Next 数据缓存（public 只读接口），否则维持 no-store。
    // 注意不能同时给 `cache` 和 `next`，所以两条分支互斥。
    const init: RequestInit = { ...options, headers };
    if (cacheOptions) {
        (init as RequestInit & { next?: { revalidate?: number; tags?: string[] } }).next = {
            ...(cacheOptions.revalidate !== undefined ? { revalidate: cacheOptions.revalidate } : {}),
            ...(cacheOptions.tags ? { tags: cacheOptions.tags } : {}),
        };
    } else {
        init.cache = "no-store";
    }

    let res: Response;
    try {
        res = await fetch(url, init);
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
 * 把「可能被包了一层」的列表结果摊平成 { list, total }。
 *
 * 为什么需要它：后端不同接口的外壳不一致——request() 已经把 { code, message, data } 剥掉了，
 * 但 data 本身可能是 `{ list, total }`、`{ data: { list, total } }`、`{ data: [...] }` 或直接一个数组。
 * 这里按同一判定顺序兼容全部四种形状，total 取不到时回落到数组长度（不编造分页信息）。
 */
export function unwrapList<T>(raw: unknown): { list: T[]; total: number } {
    // 形状 ①：本身就是数组（无分页信息）
    if (Array.isArray(raw)) return { list: raw as T[], total: raw.length };

    const box = (raw ?? {}) as Record<string, unknown>;
    // 形状 ②：又套了一层 data（data 直接是数组或对象）
    const inner = (box.data ?? box) as Record<string, unknown>;
    if (Array.isArray(inner)) return { list: inner as T[], total: inner.length };

    // 形状 ③：{ list, total }（可能还套了一层 data，上面已处理）
    const list = Array.isArray(inner.list) ? (inner.list as T[]) : [];
    const total = Number(inner.total);
    return { list, total: Number.isFinite(total) ? total : list.length };
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

// ===================== 找回密码（公开，无需登录） =====================
//
// 远端路径 /auth/check-email、/auth/forgot-password、/auth/reset-password
// （scripts/swagger.yaml「用户认证」），同源代理见 src/app/api/auth/**。
// 这三个接口匿名可调，所以走 /api/auth/* 而不是需要 cookie 的管理端代理。

/** GET /api/auth/check-email 检查邮箱是否已注册（邮箱不存在时 exists=false） */
export async function checkEmailApi(email: string): Promise<boolean> {
    const data = await request<{ exists?: boolean } | null>(
        `/api/auth/check-email?email=${encodeURIComponent(email)}`,
        { method: "GET" }
    );
    return Boolean(data?.exists);
}

/**
 * POST /api/auth/forgot-password 请求发送重置邮件。
 * 远端防枚举：邮箱不存在也返回成功，所以调用方不要据此判断邮箱是否存在。
 */
export async function forgotPasswordApi(email: string): Promise<void> {
    await request<unknown>("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
    });
}

/** POST /api/auth/reset-password 用重置邮件里的 publicUserId + sign 设置新密码 */
export async function resetPasswordApi(payload: {
    publicUserId: string;
    sign: string;
    password: string;
    repeatPassword: string;
}): Promise<void> {
    await request<unknown>("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify(payload),
    });
}

/**
 * 令牌静默续期：**没有实现**，这里明确留个说明，避免再被当成「已支持」。
 *
 * 现状：登录时 `POST /api/auth/login` 会写下 `refresh_token`（30 天，见 lib/auth.ts），
 * 但全站**没有任何地方读它**，也没有 `/api/auth/refresh` 这个同源路由；
 * access token（`token`，7 天）一过期就由 (blog) layout 标记 authExpired、
 * 客户端调 `/api/auth/logout` 静默登出（components/(blog)/auth-expired-notifier.tsx）。
 *
 * 曾经这里有个 `refreshTokenApi(refreshToken)`（直连远端 `/auth/refresh`），
 * 但**从未被调用过**，留着只会让人误判「续期已接」——已删除。
 *
 * 要真做，需要三件事（缺一不可）：
 *   1. 新增 `src/app/api/auth/refresh/route.ts`：读 cookie 里的 refresh_token → 转发远端
 *      `POST /auth/refresh` → 把新的 accessToken/refreshToken 重新写回 httpOnly cookie；
 *   2. `src/lib/admin-api.ts` 的代理在遇到远端 401 时先试一次续期再决定是否回 401；
 *   3. 客户端 `/api/auth/refresh` 的失败语义要明确（决定「静默登出」还是「重试一次」）。
 * 难点：这条链路**只有拿到有效账号才能验证**，没有账号时改它就是盲改，所以先不动。
 */

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
    return request<PostListData>(`/public/articles${query ? `?${query}` : ""}`, { method: "GET" }, undefined, {
        revalidate: 60,
        tags: [ARTICLES_TAG],
    });
}

/** GET /public/articles/{id} 前台文章详情（公共ID 或 Abbrlink） */
export function getPublicArticleApi(id: string): Promise<ArticleDetail> {
    return request<ArticleDetail>(`/public/articles/${encodeURIComponent(id)}`, { method: "GET" }, undefined, {
        revalidate: 60,
        tags: [ARTICLES_TAG, `${ARTICLES_TAG}:${id}`],
    });
}

/** GET /public/articles/random 随机获取一篇文章（无已发布文章时 404） */
export function getRandomArticleApi(): Promise<ArticleDetail> {
    return request<ArticleDetail>("/public/articles/random", { method: "GET" });
}

/** GET /public/articles/archives 归档摘要（按年月分组统计） */
export function getPublicArchivesApi(): Promise<ArchiveSummary> {
    return request<ArchiveSummary>("/public/articles/archives", { method: "GET" }, undefined, {
        revalidate: 60,
        tags: [ARTICLES_TAG],
    });
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

// ===================== 全站搜索 =====================

/** 搜索结果项（/public/search 返回的单个命中） */
export interface SearchHit {
    id: string;
    /** 类型：post / doc / album / essay */
    type?: string;
    url?: string;
    title: string;
    snippet: string;
    author: string;
    category: string;
    tags: string[];
    publish_date: string;
    cover_url: string;
    abbrlink: string;
    view_count: number;
    word_count: number;
    reading_time: number;
    is_doc?: boolean;
    doc_series_id?: string;
}

/** 搜索结果分页（/public/search 返回） */
export interface SearchResultData {
    pagination: {
        total: number;
        page: number;
        size: number;
        totalPages: number;
    };
    hits: SearchHit[];
}

/** GET /search 全站搜索文章/页面/相册等（公开；参数 q 必填，page/size 可选。注：线上版本无 /public 前缀） */
export async function searchArticlesApi(params: {
    q: string;
    page?: number;
    size?: number;
}): Promise<SearchResultData> {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== "") {
            qs.set(key, String(value));
        }
    }
    const query = qs.toString();
    return request<SearchResultData>(`/search?${query}`, { method: "GET" });
}

/** 客户端搜索（经 /api/search 同源代理；后端不开放 CORS，浏览器端需走代理） */
export async function searchArticlesClientApi(params: {
    q: string;
    page?: number;
    size?: number;
}): Promise<SearchResultData> {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== "") {
            qs.set(key, String(value));
        }
    }
    const query = qs.toString();
    return request<SearchResultData>(`/api/search${query ? `?${query}` : ""}`, { method: "GET" });
}

// ===================== 友情链接 =====================

/** GET /public/link-categories 公开友链分类列表（包含已批准友链的分类） */
export function getPublicLinkCategoriesApi(): Promise<LinkCategory[]> {
    return request<LinkCategory[]>("/public/link-categories", { method: "GET" }, undefined, {
        revalidate: 60,
        tags: [LINKS_TAG],
    });
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
    return request<LinkListData>(`/public/links${query ? `?${query}` : ""}`, { method: "GET" }, undefined, {
        revalidate: 60,
        tags: [LINKS_TAG],
    });
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

/** 公开友链申请列表请求参数（GET /public/links/applications） */
export interface PublicLinkApplicationsParams {
    page?: number;
    pageSize?: number;
    /** 审核状态：PENDING / APPROVED / REJECTED / INVALID */
    status?: string;
    category_id?: number;
    /** 名称模糊搜索 */
    name?: string;
}

/**
 * GET /public/links/applications 公开的全状态友链列表（官方公开接口、无需鉴权）。
 * 与 /public/links 的关键差别：这里**不按状态过滤**，能拿到 INVALID（已失联）的友链。
 */
export function getPublicLinkApplicationsApi(params: PublicLinkApplicationsParams = {}): Promise<LinkListData> {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== "") {
            qs.set(key, String(value));
        }
    }
    const query = qs.toString();
    return request<LinkListData>(`/public/links/applications${query ? `?${query}` : ""}`, { method: "GET" }, undefined, {
        revalidate: 60,
        tags: [LINKS_TAG],
    });
}

/** 友链页对外展示的状态：已通过 + 已失联（健康检查自动标记）。
 *  未审核（PENDING）与被拒绝（REJECTED）的申请不对访客展示。 */
const PUBLIC_LINK_STATUSES: readonly string[] = ["APPROVED", "INVALID"];

/**
 * 友链页数据源：拉全量友链后**按分类分组**，每个分类带该分类下的全部友链
 * （含状态为 INVALID 的已失联友链），供友链页「按分类展示全部友链」使用。
 *
 * 为什么不用 getLinksByCategoryApi：它走 /public/links，而该接口服务端写死
 * `WHERE status = 'APPROVED'`（link_repo.go ListPublic），已失联的友链会被整体过滤掉，
 * 分类里就只剩活着的那些。改用官方的全状态公开接口 /public/links/applications。
 *
 * 只保留 APPROVED / INVALID：未审核与被拒绝的申请不对外展示。
 * 全量拉取失败时返回 null，由调用方回退到「仅已通过」的旧路径。
 */
export async function getLinksGroupedByCategoryApi(): Promise<LinkCategoryGroup[] | null> {
    const pageSize = 50;
    const maxPages = 20; // 安全上限：最多 1000 条
    const all: FriendLink[] = [];
    const seen = new Set<number>();

    try {
        for (let page = 1; page <= maxPages; page++) {
            const data = await getPublicLinkApplicationsApi({ page, pageSize });
            const list = data.list ?? [];
            for (const link of list) {
                if (!seen.has(link.id) && PUBLIC_LINK_STATUSES.includes(link.status)) {
                    seen.add(link.id);
                    all.push(link);
                }
            }
            if (list.length === 0 || page * pageSize >= (data.total ?? 0)) {
                break;
            }
        }
    } catch {
        return null;
    }

    // 按分类分组：分类按 id 升序（保持原有展示顺序）；分类内保持后端返回顺序（= sort_order DESC），不再本地重排
    const grouped = new Map<number, LinkCategoryGroup>();
    for (const link of all) {
        const category = link.category;
        // 没有分类的友链无处安放，不展示（与「空分类隐藏」口径一致）
        if (!category) continue;
        const group = grouped.get(category.id) ?? { category, links: [] };
        group.links.push(link);
        grouped.set(category.id, group);
    }

    // 分类内**不再本地重排**（原先是按 id 降序）。
    // ⚠️ 但要注意：本函数的数据源 `GET /public/links/applications` 后端是 `Order(Desc(id))`（link_repo.go:327），
    //    查询里**没有 sort_order**（实测该接口返回的 12 条 sort_order 全是 0、id 严格降序），
    //    所以"后台排序 → 前台生效"做不到，除非后端给该查询加上 `Order(Desc(sort_order), Asc(id))`，
    //    或前台改走尊重 sort_order 的 `GET /public/links`（那里服务端写死 status=APPROVED，会丢掉失联友链）。
    //    这里只是不再用本地排序去盖后端顺序，别误以为前台已经能跟随 sort_order。
    // 分类之间仍按 id 升序（分类没有排序接口，保持原有展示顺序）。
    return [...grouped.values()].sort((a, b) => a.category.id - b.category.id);
}

/** 管理员友链列表请求参数（GET /api/admin/links，客户端经同源代理） */
export interface AdminLinkListParams {
    page?: number;
    pageSize?: number;
    /** 网站名称模糊搜索（后端字段为 name；无 keyword 参数） */
    name?: string;
    /** 后端枚举：PENDING / APPROVED / REJECTED / INVALID */
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

/** GET /api/admin/links/categories 管理员获取友链分类列表（含 id，供筛选下拉用） */
export async function getAdminLinkCategoriesApi(): Promise<LinkCategory[]> {
    return request<LinkCategory[]>("/api/admin/links/categories", { method: "GET" });
}

/** GET /api/admin/links/tags 管理员获取友链标签列表（含 id，供筛选下拉用） */
export async function getAdminLinkTagsApi(): Promise<LinkTag[]> {
    return request<LinkTag[]>("/api/admin/links/tags", { method: "GET" });
}

/** GET /api/admin/articles 管理员获取文章列表（分页，浏览器自动携带登录 cookie） */
export async function getAdminArticlesApi(params: AdminArticleListParams = {}): Promise<PostListData> {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== "") {
            qs.set(key, String(value));
        }
    }
    const query = qs.toString();
    return request<PostListData>(`/api/admin/articles${query ? `?${query}` : ""}`, { method: "GET" });
}

/** GET /api/admin/article-categories 管理员获取文章分类列表（含 id，供筛选下拉） */
export async function getAdminArticleCategoriesApi(): Promise<PostCategory[]> {
    return request<PostCategory[]>("/api/admin/article-categories", { method: "GET" });
}

/** GET /api/admin/article-tags 管理员获取文章标签列表（含 id，供筛选下拉） */
export async function getAdminArticleTagsApi(): Promise<PostTag[]> {
    return request<PostTag[]>("/api/admin/article-tags", { method: "GET" });
}

/**
 * 文章新建/更新的请求体。
 * 字段名对齐后端 swagger 的 model.CreateArticleRequest / model.UpdateArticleRequest（31 项），
 * 这里只声明本次用到的部分。
 * content_md 是 Markdown 原文；content_html 由**前端**渲染后一起提交
 * （后端不渲染 Markdown，只对这里带来的 HTML 做 SanitizeHTML：pkg/service/article/service.go:1143-1146 / 1505-1507。
 * 渲染逻辑见 src/lib/article-markdown.ts，调用点见 src/components/admin/article-form.tsx 的 save()）。
 */
export interface AdminArticlePayload {
    title: string;
    content_md: string;
    /**
     * 正文 HTML（可选）：不传这个键时后端会保留库里已有的 content_html（service.go:1505 只在非 nil 时覆盖），
     * 传空串才会清空。编辑旧文章且 content_md 为空时不要传空串。
     */
    content_html?: string;
    status?: "DRAFT" | "PUBLISHED" | "ARCHIVED" | "SCHEDULED";
    /**
     * 定时发布时间（RFC3339 字符串，如 2026-01-01T10:00:00Z；不是 datetime-local 的裸值）。
     * 后端 service.go 用 time.Parse(time.RFC3339) 解析：格式不合法报「无效的定时发布时间格式」，
     * 早于当前时间报「定时发布时间必须是未来时间」，解析通过后会把 status 归一化成 SCHEDULED。
     */
    scheduled_at?: string;
    post_category_ids?: string[];
    post_tag_ids?: string[];
    summaries?: string[];
    cover_url?: string;
    top_img_url?: string;
    keywords?: string;
    abbrlink?: string;
    primary_color?: string;
    is_primary_color_manual?: boolean;
    copyright?: boolean;
    copyright_author?: string;
    copyright_author_href?: string;
    copyright_url?: string;
    is_reprint?: boolean;
    show_on_home?: boolean;
    pin_sort?: number;
    home_sort?: number;
    ip_location?: string;
    review_status?: string;
}

/** POST /api/admin/articles 新建文章（成功返回新文章详情，含 content_html） */
export async function createAdminArticleApi(payload: AdminArticlePayload): Promise<ArticleDetail> {
    return request<ArticleDetail>("/api/admin/articles", { method: "POST", body: JSON.stringify(payload) });
}

/** PUT /api/admin/articles/[id] 更新文章 */
export async function updateAdminArticleApi(id: string | number, payload: AdminArticlePayload): Promise<ArticleDetail> {
    return request<ArticleDetail>(`/api/admin/articles/${id}`, { method: "PUT", body: JSON.stringify(payload) });
}

/** GET /api/admin/articles/[id] 管理端文章详情（编辑页回填：含 content_md 与分类/标签 id） */
export async function getAdminArticleApi(id: string | number): Promise<ArticleDetail> {
    return request<ArticleDetail>(`/api/admin/articles/${id}`, { method: "GET" });
}

/** DELETE /api/admin/articles/[id] 删除文章 */
export async function deleteAdminArticleApi(id: string | number): Promise<unknown> {
    return request(`/api/admin/articles/${id}`, { method: "DELETE" });
}

// ===================== 文章历史版本（后台） =====================

/** 历史版本列表项（GET /articles/{id}/history） */
export interface ArticleHistoryListItem {
    id: number;
    version: number;
    title: string;
    word_count: number;
    change_note: string;
    editor_nickname: string;
    created_at: string;
}

/** 完整历史版本（对比接口返回 old_version / new_version） */
export interface ArticleHistoryVersion {
    id: number;
    article_id: string;
    version: number;
    title: string;
    content_md: string;
    content_html: string;
    cover_url: string;
    top_img_url: string;
    keywords: string;
    primary_color: string;
    summaries: string[] | null;
    word_count: number;
    change_note: string;
    editor_id: number;
    editor_nickname: string;
    created_at: string;
}

/** 历史版本分页响应 */
export interface ArticleHistoryPage {
    list: ArticleHistoryListItem[] | null;
    page: number;
    page_size: number;
    total: number;
}

/** GET /api/admin/articles/[id]/history 历史版本列表（分页） */
export async function getAdminArticleHistoryApi(
    id: string | number,
    page = 1,
    pageSize = 20
): Promise<ArticleHistoryPage> {
    const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    return request<ArticleHistoryPage>(`/api/admin/articles/${id}/history?${qs.toString()}`, { method: "GET" });
}

/** GET /api/admin/articles/[id]/history/compare 取两个版本内容做对比 */
export async function compareAdminArticleHistoryApi(
    id: string | number,
    v1: number,
    v2: number
): Promise<{ new_version: ArticleHistoryVersion | null; old_version: ArticleHistoryVersion | null }> {
    const qs = new URLSearchParams({ v1: String(v1), v2: String(v2) });
    return request(`/api/admin/articles/${id}/history/compare?${qs.toString()}`, { method: "GET" });
}

/** POST /api/admin/articles/[id]/history/[version]/restore 回滚到指定版本 */
export async function restoreAdminArticleHistoryApi(
    id: string | number,
    version: number,
    changeNote?: string
): Promise<unknown> {
    return request(`/api/admin/articles/${id}/history/${version}/restore`, {
        method: "POST",
        body: JSON.stringify({ change_note: changeNote ?? "" }),
    });
}

/** POST /api/admin/links 管理员创建友链（同源代理，需登录） */
export async function createAdminLinkApi(payload: AdminCreateLinkRequest): Promise<unknown> {
    return request<unknown>("/api/admin/links", {
        method: "POST",
        body: JSON.stringify(payload),
    });
}

/** PUT /api/admin/links/{id} 管理员更新友链（同源代理，需登录） */
export async function updateAdminLinkApi(id: number | string, payload: AdminUpdateLinkRequest): Promise<unknown> {
    return request<unknown>(`/api/admin/links/${id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
    });
}

/**
 * PUT /api/admin/links/{id}/review 审核友链申请（通过 / 拒绝）。
 *
 * 远端 `model.ReviewLinkRequest`：status 必填（APPROVED / REJECTED），reject_reason 可选。
 * 与 updateAdminLinkApi 的区别：这条只改状态、能带拒绝原因，不会连带要求整条友链字段。
 */
export function reviewAdminLinkApi(
    id: number | string,
    status: "APPROVED" | "REJECTED",
    rejectReason?: string
): Promise<unknown> {
    return request<unknown>(`/api/admin/links/${encodeURIComponent(String(id))}/review`, {
        method: "PUT",
        body: JSON.stringify({ status, reject_reason: rejectReason ?? "" }),
    });
}

/**
 * DELETE /api/admin/links/{id} 管理员删除单条友链（同源代理 → 远端 DELETE /links/:id，需登录）。
 * 远端成功返回 { code: 200, message: "删除成功", data: null }。
 */
export function deleteAdminLinkApi(id: number | string): Promise<unknown> {
    return request<unknown>(`/api/admin/links/${encodeURIComponent(String(id))}`, { method: "DELETE" });
}

/** 批量删除友链的返回（远端 /links/batch-delete）：逐项结果，失败项带原因 */
export interface AdminBatchDeleteLinksResult {
    total: number;
    success: number;
    failed: number;
    failed_list?: { id: number; reason: string }[];
}

/**
 * DELETE /api/admin/links/batch-delete 管理员批量删除友链（同源代理，需登录）。
 * 远端限制一次 1~100 条；返回每条的成败统计，不是全有全无，调用方按 success/failed 提示。
 */
export function batchDeleteAdminLinksApi(ids: number[]): Promise<AdminBatchDeleteLinksResult> {
    return request<AdminBatchDeleteLinksResult>("/api/admin/links/batch-delete", {
        method: "DELETE",
        body: JSON.stringify({ ids }),
    });
}

/** 友链健康检查状态（后端 POST /links/health-check 触发后，GET 其/status 返回的进度/结果） */
export interface LinkHealthCheckStatus {
    /** 是否仍在执行中（各字段按后端实际枚举/命名兜底读取） */
    running?: boolean;
    status?: string;
    finished?: boolean;
    /** 检查总数 / 结果计数（各字段可能为 total/count、ok/success、fail/failed/error） */
    total?: number;
    count?: number;
    ok?: number;
    success?: number;
    failed?: number;
    fail?: number;
    error?: number;
}

/** POST /api/admin/links/health-check 触发后台执行友链健康检查（同源代理，需登录） */
export async function triggerLinkHealthCheckApi(): Promise<unknown> {
    return request<unknown>("/api/admin/links/health-check", { method: "POST" });
}

/** GET /api/admin/links/health-check/status 获取健康检查状态（同源代理，需登录） */
export async function getLinkHealthCheckStatusApi(): Promise<LinkHealthCheckStatus> {
    return request<LinkHealthCheckStatus>("/api/admin/links/health-check/status", { method: "GET" });
}

// ===================== 友链分类 / 标签（管理端写操作） =====================
//
// 远端路径 /links/categories、/links/tags（含 /{id}）；
// 同源代理见 src/app/api/admin/links/categories/**、src/app/api/admin/links/tags/**。

/** POST /api/admin/links/categories 新建友链分类（style 必填：card / list） */
export function createAdminLinkCategoryApi(payload: LinkCategoryPayload): Promise<LinkCategory> {
    return request<LinkCategory>("/api/admin/links/categories", {
        method: "POST",
        body: JSON.stringify(payload),
    });
}

/** PUT /api/admin/links/categories/{id} 更新友链分类 */
export function updateAdminLinkCategoryApi(id: number | string, payload: LinkCategoryPayload): Promise<LinkCategory> {
    return request<LinkCategory>(`/api/admin/links/categories/${encodeURIComponent(String(id))}`, {
        method: "PUT",
        body: JSON.stringify(payload),
    });
}

/** DELETE /api/admin/links/categories/{id} 删除友链分类 */
export function deleteAdminLinkCategoryApi(id: number | string): Promise<unknown> {
    return request<unknown>(`/api/admin/links/categories/${encodeURIComponent(String(id))}`, { method: "DELETE" });
}

/** POST /api/admin/links/tags 新建友链标签 */
export function createAdminLinkTagApi(payload: LinkTagPayload): Promise<LinkTag> {
    return request<LinkTag>("/api/admin/links/tags", {
        method: "POST",
        body: JSON.stringify(payload),
    });
}

/** PUT /api/admin/links/tags/{id} 更新友链标签 */
export function updateAdminLinkTagApi(id: number | string, payload: LinkTagPayload): Promise<LinkTag> {
    return request<LinkTag>(`/api/admin/links/tags/${encodeURIComponent(String(id))}`, {
        method: "PUT",
        body: JSON.stringify(payload),
    });
}

/** DELETE /api/admin/links/tags/{id} 删除友链标签 */
export function deleteAdminLinkTagApi(id: number | string): Promise<unknown> {
    return request<unknown>(`/api/admin/links/tags/${encodeURIComponent(String(id))}`, { method: "DELETE" });
}

// ===================== 友链导入 / 导出 =====================
//
// 远端 POST /links/import、GET /links/export；导出返回的 links 与导入同构（可直接回灌）。
// 同源代理见 src/app/api/admin/links/import、src/app/api/admin/links/export。

/** POST /api/admin/links/import 批量导入友链（逐项统计，不是全有全无） */
export function importAdminLinksApi(payload: ImportLinksRequest): Promise<ImportLinksResponse> {
    return request<ImportLinksResponse>("/api/admin/links/import", {
        method: "POST",
        body: JSON.stringify(payload),
    });
}

/** 导出友链的筛选条件（与列表接口同口径，留空即全部） */
export interface ExportAdminLinksParams {
    name?: string;
    url?: string;
    description?: string;
    status?: string;
    category_id?: number | string;
    tag_id?: number | string;
}

/** GET /api/admin/links/export 导出友链（返回 ImportLinkItem 数组，用于备份/迁移） */
export function exportAdminLinksApi(params: ExportAdminLinksParams = {}): Promise<ExportLinksResponse> {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== "") {
            qs.set(key, String(value));
        }
    }
    const query = qs.toString();
    return request<ExportLinksResponse>(`/api/admin/links/export${query ? `?${query}` : ""}`, { method: "GET" });
}

/** POST /api/admin/users 管理员创建用户（同源代理，需登录；浏览器自动携带登录 cookie） */
export async function createAdminUserApi(payload: AdminCreateUserRequest): Promise<unknown> {
    return request<unknown>("/api/admin/users", {
        method: "POST",
        body: JSON.stringify(payload),
    });
}

/** 友链申请提交数据（POST /public/links） */
export interface LinkApplyPayload {
    /** 申请类型：NEW-新增友链，UPDATE-修改友链（后端必填，仅允许 NEW/UPDATE） */
    type: "NEW" | "UPDATE";
    name: string;
    url: string;
    logo: string;
    description: string;
    siteshot?: string;
    /** 联系邮箱（后端必填且须为邮箱格式） */
    email: string;
    /** RSS 地址（后端字段名 rss_url） */
    rss_url?: string;
    /** 修改类型时：原友链URL */
    original_url?: string;
    /** 修改类型时：修改原因说明 */
    update_reason?: string;
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

/** GET /api/admin/essays 管理后台说说列表（同源代理，浏览器带 cookie，无需显式 token） */
export async function getAdminEssaysListApi(params: AdminEssayListParams = {}): Promise<EssayListData> {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
            qs.set(key, String(value));
        }
    }
    const query = qs.toString();
    return request<EssayListData>(`/api/admin/essays${query ? `?${query}` : ""}`, { method: "GET" });
}

/** PUT /api/admin/essays/{id} 管理员更新说说（同源代理） */
export async function updateAdminEssayApi(id: number | string, payload: AdminUpdateEssayRequest): Promise<unknown> {
    return request<unknown>(`/api/admin/essays/${id}`, { method: "PUT", body: JSON.stringify(payload) });
}

/** POST /api/admin/essays 管理后台新增说说（同源代理） */
export async function createAdminEssayApi(payload: AdminCreateEssayRequest): Promise<unknown> {
    return request<unknown>("/api/admin/essays", { method: "POST", body: JSON.stringify(payload) });
}

/** DELETE /api/admin/essays/{id} 管理员删除说说（同源代理） */
export async function deleteAdminEssayApi(id: number | string): Promise<unknown> {
    return request<unknown>(`/api/admin/essays/${id}`, { method: "DELETE" });
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
    return request<EssayListData>(`/pro/essays${query ? `?${query}` : ""}`, { method: "GET" }, undefined, {
        revalidate: 60,
        tags: [ESSAYS_TAG],
    });
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
    return request<MomentsListData>(`/pro/moments${query ? `?${query}` : ""}`, { method: "GET" }, undefined, {
        revalidate: 60,
        tags: [MOMENTS_TAG],
    });
}

/** GET /pro/moments/randompost 随机获取一篇朋友圈/友链聚合文章（公开；友链鱼塘用） */
export function getRandomMomentPostApi(): Promise<RandomMomentPost> {
    return request<RandomMomentPost>("/pro/moments/randompost", { method: "GET" });
}

/** 客户端随机获取一篇（经 /api/moments/randompost 同源代理；后端不开放 CORS，浏览器端需走代理） */
export async function getRandomMomentPostClientApi(): Promise<RandomMomentPost | null> {
    try {
        return await request<RandomMomentPost>("/api/moments/randompost", { method: "GET" });
    } catch {
        return null;
    }
}

/** GET /public/site-config 站点公开配置（服务端调用） */
export function getPublicSiteConfigApi(): Promise<SiteConfig> {
    return request<SiteConfig>("/public/site-config", { method: "GET" }, undefined, {
        revalidate: 60,
        tags: [SITE_CONFIG_TAG],
    });
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
    return request<BasicStats>("/public/statistics/basic", { method: "GET" }, undefined, {
        revalidate: 60,
        tags: [STATS_TAG],
    });
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
    /** 访客 UA（Windows / macOS / 浏览器及版本据此解析，后台可能为空） */
    user_agent?: string;
    /** QQ 号（后端返回，可为空） */
    qq_number?: string;
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
    return request<CommentListData>(`/public/comments/latest${query ? `?${query}` : ""}`, { method: "GET" }, undefined, {
        revalidate: 30,
        tags: [COMMENTS_TAG],
    });
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
    return request<CommentListData>(`/public/comments${query ? `?${query}` : ""}`, { method: "GET" }, undefined, {
        revalidate: 30,
        tags: [COMMENTS_TAG],
    });
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
    }, undefined, {
        revalidate: 30,
        tags: [COMMENTS_TAG],
    });
}

/** 提交评论的请求体（POST /public/comments，经同源代理 /api/public/comments 转发） */
export interface CommentCreatePayload {
    target_path: string;
    target_title?: string;
    parent_id?: string;
    reply_to_id?: string;
    nickname: string;
    email?: string;
    website?: string;
    content: string;
    is_anonymous: boolean;
}

/** POST /api/public/comments 提交评论（本应用同源路由，服务端转发到远端 /public/comments） */
export async function submitCommentApi(payload: CommentCreatePayload): Promise<unknown> {
    return request<unknown>("/api/public/comments", {
        method: "POST",
        body: JSON.stringify(payload),
    });
}

/**
 * POST /api/public/comments/upload 上传评论图片（经同源代理转发）。
 * 返回文件的公开 ID（字符串）；前端用 `![](anzhiyu://file/{id})` 的形式拼进评论正文，
 * 后端在返回评论列表时会把内部 URI 解析成真实访问 URL。
 */
export async function uploadCommentImageApi(file: File): Promise<string> {
    const form = new FormData();
    form.append("file", file);
    let res: Response;
    try {
        // 不能走 request() 帮助函数（它会为 body 设置 JSON Content-Type，破坏 multipart boundary）
        res = await fetch("/api/public/comments/upload", { method: "POST", body: form });
    } catch {
        throw new ApiError("网络请求失败，请检查网络连接", 0, 0);
    }
    let json: ApiResponse<{ id: string }> | null = null;
    try {
        json = (await res.json()) as ApiResponse<{ id: string }>;
    } catch {
        // 非 JSON 响应
    }
    if (res.ok && json && typeof json.data?.id === "string") {
        return json.data.id;
    }
    throw new ApiError(json?.message || `图片上传失败（HTTP ${res.status}）`, res.status, json?.code ?? res.status);
}

/**
 * POST /api/public/comments/{id}/like 点赞一条评论，返回**最新点赞数**。
 *
 * 后端只是计数器 +1（见 scripts/swagger.yaml 的 /public/comments/{id}/like），
 * 不校验是否已经点过、也不记是谁点的 —— 「同一浏览器只点一次」由调用方自己记（localStorage）。
 */
export async function likeCommentApi(id: string): Promise<number> {
    const n = await request<number>(`/api/public/comments/${encodeURIComponent(id)}/like`, { method: "POST" });
    return typeof n === "number" ? n : 0;
}

/** POST /api/public/comments/{id}/unlike 取消点赞，返回最新点赞数（同样不按人去重） */
export async function unlikeCommentApi(id: string): Promise<number> {
    const n = await request<number>(`/api/public/comments/${encodeURIComponent(id)}/unlike`, { method: "POST" });
    return typeof n === "number" ? n : 0;
}

/** 带子评论的评论（父评论 + 博主回复等） */export interface CommentWithChildren extends RecentComment {
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

// ===================== 管理端评论（/comments） =====================
//
// 官方 swagger「评论管理」标签：与公开的 /public/comments 不同，
// 这里返回 email / ip_address / status / pinned_at 等管理字段，且需要 Bearer token。
// 全部经同源代理 /api/admin/comments/* 转发（浏览器带 httpOnly cookie）。

/** GET /api/admin/comments 管理端评论列表（分页 + 昵称/邮箱/内容/路径/IP/状态筛选） */
export async function getAdminCommentsApi(params: AdminCommentListParams = {}): Promise<AdminCommentListData> {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== "") {
            qs.set(key, String(value));
        }
    }
    const query = qs.toString();
    return request<AdminCommentListData>(`/api/admin/comments${query ? `?${query}` : ""}`, { method: "GET" });
}

/** DELETE /api/admin/comments 批量删除评论（请求体 { ids }） */
export function deleteAdminCommentsApi(ids: string[]): Promise<unknown> {
    return request<unknown>("/api/admin/comments", { method: "DELETE", body: JSON.stringify({ ids }) });
}

/** PUT /api/admin/comments/{id}/info 更新评论内容 / 昵称 / 邮箱 / 网站（同源代理） */
export function updateAdminCommentInfoApi(id: string, payload: AdminUpdateCommentRequest): Promise<unknown> {
    return request<unknown>(`/api/admin/comments/${encodeURIComponent(id)}/info`, {
        method: "PUT",
        body: JSON.stringify(payload),
    });
}

/** PUT /api/admin/comments/{id}/status 更新评论状态（1=已发布 2=待审核） */
export function updateAdminCommentStatusApi(id: string, status: CommentStatus): Promise<unknown> {
    return request<unknown>(`/api/admin/comments/${encodeURIComponent(id)}/status`, {
        method: "PUT",
        body: JSON.stringify({ status }),
    });
}

/** PUT /api/admin/comments/{id}/pin 置顶 / 取消置顶评论 */
export function toggleAdminCommentPinApi(id: string, pinned: boolean): Promise<unknown> {
    return request<unknown>(`/api/admin/comments/${encodeURIComponent(id)}/pin`, {
        method: "PUT",
        body: JSON.stringify({ pinned }),
    });
}

// ===================== 用户中心（/user/*，需登录） =====================
//
// 官方对应实现：anheyu-app-frontend 的 src/lib/api/user-center.ts。
// 后端不开放 CORS，全部经同源代理 /api/user/* 转发（浏览器带 httpOnly cookie 里的 token）。

/** 通知设置（后端 SimpleUserNotificationSettings） */
export interface UserNotificationSettings {
    /** 是否接收评论回复通知 */
    allowCommentReplyNotification: boolean;
}

/** PUT /api/user/profile 更新资料（昵称 / 个人网站） */
export function updateUserProfileApi(payload: { nickname?: string; website?: string }): Promise<unknown> {
    return request<unknown>("/api/user/profile", { method: "PUT", body: JSON.stringify(payload) });
}

/** POST /api/user/update-password 修改密码（成功后需重新登录） */
export function updateUserPasswordApi(payload: { oldPassword: string; newPassword: string }): Promise<unknown> {
    return request<unknown>("/api/user/update-password", { method: "POST", body: JSON.stringify(payload) });
}

/** POST /api/user/avatar 上传头像（multipart）；返回后端给出的新头像 URL */
export async function uploadUserAvatarApi(file: File): Promise<string | null> {
    const form = new FormData();
    form.append("file", file);
    let res: Response;
    try {
        // 不能走 request() 帮助函数（它会为 body 设置 JSON Content-Type，破坏 multipart boundary）
        res = await fetch("/api/user/avatar", { method: "POST", body: form });
    } catch {
        throw new ApiError("网络请求失败，请检查网络连接", 0, 0);
    }
    let json: ApiResponse<{ url?: string }> | null = null;
    try {
        json = (await res.json()) as ApiResponse<{ url?: string }>;
    } catch {
        // 非 JSON 响应
    }
    if (res.ok && json?.code === 200) {
        return json.data?.url ?? null;
    }
    throw new ApiError(json?.message || `头像上传失败（HTTP ${res.status}）`, res.status, json?.code ?? res.status);
}

/** GET /api/user/notification-settings 读取通知设置 */
export function getNotificationSettingsApi(): Promise<UserNotificationSettings> {
    return request<UserNotificationSettings>("/api/user/notification-settings", { method: "GET" });
}

/** PUT /api/user/notification-settings 保存通知设置 */
export function updateNotificationSettingsApi(payload: UserNotificationSettings): Promise<unknown> {
    return request<unknown>("/api/user/notification-settings", { method: "PUT", body: JSON.stringify(payload) });
}

// ===================== 消息通知（/pro/notifications，需登录） =====================
//
// 官方对应实现：anheyu-app-frontend 的 (frontend)/notifications（客户端调 /api/pro/notifications）。
// 后端不开放 CORS，这里经同源代理 /api/pro/notifications* 转发。

/** 通知类型（官方分类：文章评论 / 购买通知 / 会员服务 / 工单 / 系统通知） */
export type NotificationType = "COMMENT" | "PURCHASE" | "MEMBERSHIP" | "TICKET" | "SYSTEM";

/** 单条通知 */
export interface NotificationItem {
    id: string;
    type: NotificationType | string;
    is_read: boolean;
    title: string;
    /** 通知正文（后端返回的可能含 HTML） */
    content: string;
    created_at: string;
    /** 关联链接：有值时详情页显示「查看详情 →」 */
    link?: string | null;
}

/** GET /pro/notifications 返回的 data */
export interface NotificationListData {
    list: NotificationItem[];
    unread_count: number;
}

/** GET /api/pro/notifications 通知列表（page / page_size / unread_only 原样透传给后端） */
export async function getNotificationsApi(
    params: { page?: number; page_size?: number; unread_only?: boolean } = {},
): Promise<NotificationListData> {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
            qs.set(key, String(value));
        }
    }
    const query = qs.toString();
    return request<NotificationListData>(`/api/pro/notifications${query ? `?${query}` : ""}`, { method: "GET" });
}

/** POST /api/pro/notifications/{id}/read 标记单条通知已读 */
export function markNotificationReadApi(id: string): Promise<unknown> {
    return request<unknown>(`/api/pro/notifications/${encodeURIComponent(id)}/read`, { method: "POST" });
}

/** POST /api/pro/notifications/read-all 全部标为已读 */
export function markAllNotificationsReadApi(): Promise<unknown> {
    return request<unknown>("/api/pro/notifications/read-all", { method: "POST" });
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
    return request<PublicPage>(`/public/pages/${encodeURIComponent(clean)}`, { method: "GET" }, undefined, {
        revalidate: 60,
        tags: [PAGES_TAG],
    });
}

// ===================== 页面管理（后台）PAGES =====================

/** 后台页面条目（比公开的 PublicPage 多了自定义脚本/样式） */
export interface AdminPage {
    id: number;
    title: string;
    /** 页面路径，如 /privacy、/message */
    path: string;
    /** HTML 内容（前台渲染的就是这个） */
    content: string;
    /** Markdown 原始内容 */
    markdown_content: string;
    custom_js: string;
    custom_css: string;
    description: string;
    is_published: boolean;
    show_comment: boolean;
    sort: number;
    created_at: string;
    updated_at: string;
}

/** 新建/更新页面的请求体（更新时字段可只传改动项） */
export interface AdminPagePayload {
    title?: string;
    path?: string;
    content?: string;
    markdown_content?: string;
    custom_js?: string;
    custom_css?: string;
    description?: string;
    is_published?: boolean;
    show_comment?: boolean;
    sort?: number;
}

/** GET /pages 的列表数据（注意：分页字段是 page/size/total） */
export interface AdminPageListData {
    page: number;
    size: number;
    total: number;
    pages: AdminPage[];
}

/** GET /api/admin/pages 后台页面列表（同源代理 → 远端 GET /pages，需管理员） */
export async function getAdminPagesApi(
    params: { page?: number; page_size?: number; search?: string; is_published?: boolean } = {}
): Promise<AdminPageListData> {
    const qs = new URLSearchParams();
    qs.set("page", String(params.page ?? 1));
    qs.set("page_size", String(params.page_size ?? 10));
    if (params.search) qs.set("search", params.search);
    if (typeof params.is_published === "boolean") qs.set("is_published", String(params.is_published));
    return request<AdminPageListData>(`/api/admin/pages?${qs.toString()}`, { method: "GET" });
}

/**
 * GET /api/admin/pages/[id] 单个页面详情（同源代理 → 远端 GET /pages/:id，需管理员）。
 * 编辑页要回填 content（HTML，前台渲染的就是它）与 markdown_content；
 * 它必须走详情接口而不是从列表里拿 —— 列表页只带标题/路径等摘要字段，正文不在里面。
 */
export function getAdminPageApi(id: number | string): Promise<AdminPage> {
    return request<AdminPage>(`/api/admin/pages/${encodeURIComponent(String(id))}`, { method: "GET" });
}

/** POST /api/admin/pages 新建页面（远端 create 要求 title / path / content 必填） */
export function createAdminPageApi(body: AdminPagePayload): Promise<AdminPage> {
    return request<AdminPage>("/api/admin/pages", { method: "POST", body: JSON.stringify(body) });
}

/** PUT /api/admin/pages/[id] 更新页面（只传要改的字段） */
export function updateAdminPageApi(id: number, body: AdminPagePayload): Promise<AdminPage> {
    return request<AdminPage>(`/api/admin/pages/${id}`, { method: "PUT", body: JSON.stringify(body) });
}

/** DELETE /api/admin/pages/[id] 删除页面 */
export function deleteAdminPageApi(id: number): Promise<unknown> {
    return request(`/api/admin/pages/${id}`, { method: "DELETE" });
}

/** POST /api/admin/pages/initialize 初始化默认页面（/privacy、/cookies、/copyright 等） */
export function initializeAdminPagesApi(): Promise<unknown> {
    return request("/api/admin/pages/initialize", { method: "POST" });
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

// ===================== 相册管理（后台）ALBUMS =====================

/** 后台相册分类（远端 AlbumCategoryDTO：排序字段叫 displayOrder） */
export interface AdminAlbumCategory {
    id: number;
    name: string;
    description?: string;
    displayOrder: number;
}

/** 后台相册图片：比公开接口多一个 widthAndHeight 展示字段 */
export interface AdminAlbum extends Album {
    widthAndHeight?: string;
}

/** GET /albums/get 的列表数据 */
export interface AdminAlbumListData {
    list: AdminAlbum[];
    total: number;
    pageNum: number;
    pageSize: number;
}

/** 相册排序方式（远端 album_repo 支持的取值） */
export const ALBUM_SORT_OPTIONS = [
    { value: "display_order_asc", label: "自定义排序" },
    { value: "created_at_desc", label: "最新优先" },
    { value: "created_at_asc", label: "最早优先" },
    { value: "view_count_desc", label: "浏览最多" },
] as const;

/** 批量导入结果（远端 /albums/batch-import） */
export interface AdminAlbumImportResult {
    successCount: number;
    failCount: number;
    skipCount: number;
    total: number;
    errors?: { url: string; reason: string }[];
    duplicates?: string[];
}

/** GET /api/admin/albums/get 后台图片列表（远端 GET /albums/get，需管理员） */
export async function getAdminAlbumsApi(
    params: { page?: number; pageSize?: number; categoryId?: number | string; tag?: string; sort?: string } = {}
): Promise<AdminAlbumListData> {
    const qs = new URLSearchParams();
    qs.set("page", String(params.page ?? 1));
    qs.set("pageSize", String(params.pageSize ?? 12));
    if (params.categoryId !== undefined && params.categoryId !== "") qs.set("categoryId", String(params.categoryId));
    if (params.tag) qs.set("tag", params.tag);
    if (params.sort) qs.set("sort", params.sort);
    return request<AdminAlbumListData>(`/api/admin/albums/get?${qs.toString()}`, { method: "GET" });
}

/** 新增图片请求体（远端 imageUrl / fileHash 必填） */
export interface AdminAlbumPayload {
    categoryId?: number | null;
    imageUrl: string;
    bigImageUrl?: string;
    downloadUrl?: string;
    thumbParam?: string;
    bigParam?: string;
    tags?: string[];
    width?: number;
    height?: number;
    fileSize?: number;
    format?: string;
    fileHash?: string;
    displayOrder?: number;
    title?: string;
    description?: string;
    location?: string;
    published_at?: string | null;
}

/** POST /api/admin/albums/add 新增单张图片（需 imageUrl + fileHash） */
export function addAdminAlbumApi(body: AdminAlbumPayload): Promise<AdminAlbum> {
    return request<AdminAlbum>("/api/admin/albums/add", { method: "POST", body: JSON.stringify(body) });
}

/** PUT /api/admin/albums/update/[id] 更新图片信息（远端 imageUrl 必填，需带上原图地址） */
export function updateAdminAlbumApi(id: number, body: AdminAlbumPayload): Promise<unknown> {
    return request(`/api/admin/albums/update/${id}`, { method: "PUT", body: JSON.stringify(body) });
}

/** DELETE /api/admin/albums/delete/[id] 删除单张图片 */
export function deleteAdminAlbumApi(id: number): Promise<unknown> {
    return request(`/api/admin/albums/delete/${id}`, { method: "DELETE" });
}

/** DELETE /api/admin/albums/batch-delete 批量删除图片 */
export function batchDeleteAdminAlbumsApi(ids: number[]): Promise<unknown> {
    return request("/api/admin/albums/batch-delete", { method: "DELETE", body: JSON.stringify({ ids }) });
}

/** POST /api/admin/albums/batch-import 按 URL 批量导入（后端自动抓取并解析尺寸/大小/哈希） */
export function batchImportAdminAlbumsApi(body: {
    urls: string[];
    categoryId?: number | null;
    tags?: string[];
    thumbParam?: string;
    bigParam?: string;
    displayOrder?: number;
}): Promise<AdminAlbumImportResult> {
    return request<AdminAlbumImportResult>("/api/admin/albums/batch-import", {
        method: "POST",
        body: JSON.stringify(body),
    });
}

/** GET /api/admin/album-categories 相册分类列表 */
export function getAdminAlbumCategoriesApi(): Promise<AdminAlbumCategory[]> {
    return request<AdminAlbumCategory[]>("/api/admin/album-categories", { method: "GET" });
}

/** POST /api/admin/album-categories 新建相册分类（name 必填） */
export function createAdminAlbumCategoryApi(body: {
    name: string;
    description?: string;
    displayOrder?: number;
}): Promise<AdminAlbumCategory> {
    return request<AdminAlbumCategory>("/api/admin/album-categories", { method: "POST", body: JSON.stringify(body) });
}

/** PUT /api/admin/album-categories/[id] 更新相册分类 */
export function updateAdminAlbumCategoryApi(
    id: number,
    body: { name: string; description?: string; displayOrder?: number }
): Promise<AdminAlbumCategory> {
    return request<AdminAlbumCategory>(`/api/admin/album-categories/${id}`, {
        method: "PUT",
        body: JSON.stringify(body),
    });
}

/** DELETE /api/admin/album-categories/[id] 删除相册分类 */
export function deleteAdminAlbumCategoryApi(id: number): Promise<unknown> {
    return request(`/api/admin/album-categories/${id}`, { method: "DELETE" });
}

// ===================== 朋友圈管理（后台 · PRO） =====================
// 远端路径：/pro/admin/moments 系列（全部需登录 + 管理员，无 CORS → 一律走同源代理）
// 依据：线上官方后台 /admin/moments 的前端实现

/** 管理端排序字段（与官方后台下拉框一致） */
export const MOMENT_SORT_OPTIONS = [
    { value: "published_at", label: "发布时间" },
    { value: "created_at", label: "入库时间" },
    { value: "fetched_at", label: "抓取时间" },
    { value: "link_name", label: "友链名称" },
    { value: "post_title", label: "文章标题" },
] as const;

/** 管理端排序方向 */
export const MOMENT_SORT_ORDER_OPTIONS = [
    { value: "desc", label: "降序" },
    { value: "asc", label: "升序" },
] as const;

/** 官方默认排序：按发布时间降序 */
export const MOMENT_DEFAULT_SORT_BY: MomentSortBy = "published_at";
export const MOMENT_DEFAULT_SORT_ORDER: MomentSortOrder = "desc";

/**
 * GET /api/admin/moments 后台朋友圈列表（同源代理 → 远端 GET /pro/admin/moments，需管理员）
 * 注意：keyword 空串不传、link_id 仅 > 0 时传（与官方前端一致）。
 */
export async function getAdminMomentsApi(params: AdminMomentsListParams = {}): Promise<AdminMomentsListData> {
    const qs = new URLSearchParams();
    qs.set("page", String(params.page ?? 1));
    qs.set("page_size", String(params.page_size ?? 10));
    const keyword = params.keyword?.trim();
    if (keyword) qs.set("keyword", keyword);
    if (params.link_id && params.link_id > 0) qs.set("link_id", String(params.link_id));
    if (params.sort_by) qs.set("sort_by", params.sort_by);
    if (params.sort_order) qs.set("sort_order", params.sort_order);
    return request<AdminMomentsListData>(`/api/admin/moments?${qs.toString()}`, { method: "GET" });
}

/** GET /api/admin/moments/[id] 朋友圈详情（同源代理） */
export function getAdminMomentDetailApi(id: number): Promise<AdminMomentItem> {
    return request<AdminMomentItem>(`/api/admin/moments/${id}`, { method: "GET" });
}

/** PUT /api/admin/moments/[id] 更新朋友圈（同源代理） */
export function updateAdminMomentApi(id: number, body: AdminMomentUpdatePayload): Promise<AdminMomentItem> {
    return request<AdminMomentItem>(`/api/admin/moments/${id}`, { method: "PUT", body: JSON.stringify(body) });
}

/** DELETE /api/admin/moments/[id] 删除单条朋友圈（同源代理） */
export function deleteAdminMomentApi(id: number): Promise<unknown> {
    return request(`/api/admin/moments/${id}`, { method: "DELETE" });
}

/** POST /api/admin/moments/batch-delete 批量删除朋友圈（body 为 { ids }） */
export function batchDeleteAdminMomentsApi(ids: number[]): Promise<unknown> {
    return request("/api/admin/moments/batch-delete", { method: "POST", body: JSON.stringify({ ids }) });
}

/** POST /api/admin/moments/fetch 触发一次 RSS 抓取（异步，需再轮询 fetch-status） */
export function triggerAdminMomentsFetchApi(): Promise<unknown> {
    return request("/api/admin/moments/fetch", { method: "POST" });
}

/** GET /api/admin/moments/fetch-status 获取 RSS 抓取状态 */
export function getAdminMomentsFetchStatusApi(): Promise<MomentFetchStatus> {
    return request<MomentFetchStatus>("/api/admin/moments/fetch-status", { method: "GET" });
}

/** POST /api/admin/moments/clear-cache 清理朋友圈缓存 */
export function clearAdminMomentsCacheApi(): Promise<unknown> {
    return request("/api/admin/moments/clear-cache", { method: "POST" });
}

// ===================== 系统设置（后台）SETTINGS =====================
// 远端：/settings/get-by-keys（按需读）、/settings/update（只提交改动项）
// 后端键是点号路径（如 footer.socialBar.left）；值一律以字符串提交（JSON 用 JSON.stringify）。

/** POST /api/admin/settings/get-by-keys 按需读取设置（同源代理，需管理员） */
export function getAdminSettingsByKeysApi(keys: string[]): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>("/api/admin/settings/get-by-keys", {
        method: "POST",
        body: JSON.stringify({ keys }),
    });
}

/** POST /api/admin/settings/update 保存设置改动（同源代理，只传改动项） */
export function updateAdminSettingsApi(payload: Record<string, string>): Promise<unknown> {
    return request<unknown>("/api/admin/settings/update", {
        method: "POST",
        body: JSON.stringify(payload),
    });
}

/**
 * POST /api/admin/settings/test-email 按当前 SMTP 配置向指定地址发一封测试邮件。
 *
 * 远端契约：body { to_email }（dto.TestEmailRequest），500 表示发信失败（通常是 SMTP 配置错）。
 * ⚠️ 会真的发信，只允许由管理员点击触发。
 */
export function sendTestEmailApi(toEmail: string): Promise<unknown> {
    return request<unknown>("/api/admin/settings/test-email", {
        method: "POST",
        body: JSON.stringify({ to_email: toEmail }),
    });
}

/**
 * POST /api/admin/articles/upload 后台上传图片（同源代理 → 远端 POST /articles/upload，需管理员）。
 * 官方后台所有图片字段（站点头像、Logo、页脚图片…）都用这一个接口；
 * 返回本站托管的图片地址与文件 ID。
 */
export async function uploadAdminImageApi(file: File): Promise<{ url: string; file_id?: string }> {
    const formData = new FormData();
    formData.append("file", file);
    // FormData 交给 fetch 自动带 boundary，不能手动设 Content-Type
    return request<{ url: string; file_id?: string }>("/api/admin/articles/upload", {
        method: "POST",
        body: formData,
    });
}

/**
 * POST /api/admin/essays/upload-image 后台上传说说图片（同源代理 → 远端 POST /pro/essays/upload-image，需管理员）。
 * 远端路径依据见 src/app/api/admin/essays/upload-image/route.ts（实测 POST 只有 /pro/essays/upload-image 存在）。
 * 该接口会把图片存到后端的 essay_image 目录（前端不传任何目录参数，官方前端 FormData 只有 file）。
 *
 * 该接口官方前端返回形如 { url, file_id }，但文档未固定字段名，故做兼容解析：
 * - 取 url / file_id 两个字段（任一缺失都不报错）；
 * - 兼容「响应体直接是 data」与「data 里再套一层 data」两种包裹；
 * - 拿不到任何地址时不抛错，只返回空 url，由调用方统一提示（避免各处重复处理）。
 */
export async function uploadAdminEssayImageApi(file: File): Promise<{ url: string; file_id?: string }> {
    const formData = new FormData();
    formData.append("file", file);
    // FormData 交给 fetch 自动带 boundary，不能手动设 Content-Type
    const data = await request<unknown>("/api/admin/essays/upload-image", {
        method: "POST",
        body: formData,
    });

    const pick = (source: unknown): { url: string; file_id?: string } => {
        const record = (source ?? {}) as Record<string, unknown>;
        const url = typeof record.url === "string" ? record.url : "";
        const fileId = typeof record.file_id === "string" ? record.file_id : undefined;
        // file_id 兜底当地址用：兼容「只回 file_id」的后端（值本身可能是 URL 或 /api/f/... 路径）
        return { url: url || fileId || "", file_id: fileId };
    };

    const outer = pick(data);
    if (outer.url) return outer;
    // 极少数情况可能整体包了一层 { data: {...} }
    return pick((data as { data?: unknown } | null)?.data);
}

// ===================== 文件管理 FILE =====================

/** 文件管理根路径（后端虚拟路径 URI，默认「我的文件」） */
export const FILE_ROOT_URI = "anzhiyu://my/";

/** 文件/目录条目（后端 GET /files 的 FileItem） */
export interface AdminFileItem {
    id: string;
    name: string;
    /** 1=文件 2=目录 */
    type: number;
    size: number;
    created_at: string;
    updated_at: string;
    /** 图片等可预览文件的缩略图地址（可能缺失，也可能是相对路径，展示前过一遍 resolveAssetUrl） */
    thumbnail_url?: string;
    /** 完整虚拟路径，如 anzhiyu://my/images/a.jpg */
    path: string;
    owned: boolean;
    shared: boolean;
    /** 物理直链（部分文件才有） */
    url?: string;
    metadata?: Record<string, string>;
    capability?: string;
    primary_entity_public_id?: string;
}

/** 游标分页信息（后端不返回总数） */
export interface AdminFilePagination {
    page: number;
    page_size: number;
    /** 为空表示没有下一页 */
    next_token?: string;
    is_cursor: boolean;
}

/** GET /files 的响应数据 */
export interface AdminFileListData {
    files: AdminFileItem[];
    /** 当前目录本身（根目录时可能为 null） */
    parent: AdminFileItem | null;
    pagination: AdminFilePagination;
    props?: { order_by_options?: string[]; order_direction_options?: string[] };
    context_hint?: string;
    storage_policy?: unknown;
}

/**
 * GET /api/admin/file 文件/目录列表（同源代理 → 远端 GET /file，需登录）。
 * 传 next_token 拉下一页（游标分页，返回的 pagination.next_token 为空即到底）。
 *
 * 注意：线上后端是**单数** /file（实测 GET /files 为 404，Apifox 文档写的是复数）。
 */
export async function getAdminFilesApi(
    params: { uri?: string; next_token?: string } = {}
): Promise<AdminFileListData> {
    const qs = new URLSearchParams();
    qs.set("uri", params.uri || FILE_ROOT_URI);
    if (params.next_token) qs.set("next_token", params.next_token);
    return request<AdminFileListData>(`/api/admin/file?${qs.toString()}`, { method: "GET" });
}

/** GET /api/admin/file/[id] 单个文件/目录详情 → 远端 GET /file/:id */
export function getAdminFileInfoApi(id: string): Promise<{ file?: AdminFileItem } & Record<string, unknown>> {
    return request(`/api/admin/file/${encodeURIComponent(id)}`, { method: "GET" });
}

/** DELETE /api/admin/file（JSON 体 { ids }）删除一个或多个文件/目录（远端按 ids 批量删） */
export function deleteAdminFilesApi(ids: string[]): Promise<unknown> {
    // 远端 handler 用 ShouldBindJSON 读 model.DeleteItemsRequest{ IDs []string `json:"ids"` }
    // （pkg/handler/file/operation.go:180-185），要的是 JSON 体。router.go:563 注释里的 "?ids=..."
    // 是过时且与 handler 契约矛盾的文档写法：按 query 发因为没有 body 会得到 400「请求参数无效: EOF」。
    return request("/api/admin/file", { method: "DELETE", body: JSON.stringify({ ids }) });
}

/** POST /api/admin/file/create 新建空文件或目录（type: 1=文件 2=目录，uri 为含新名称的完整虚拟路径） */
export function createAdminFileApi(body: {
    uri: string;
    type: 1 | 2;
    err_on_conflict?: boolean;
}): Promise<unknown> {
    return request("/api/admin/file/create", { method: "POST", body: JSON.stringify(body) });
}

/** 创建上传会话的返回（远端 PUT /file/upload） */
export interface AdminUploadSession {
    expires: number;
    /** server = 分片传给后端；client = 浏览器直传云存储（本应用暂不支持） */
    upload_method: "server" | "client";
    session_id?: string;
    chunk_size?: number;
    upload_url?: string;
    content_type?: string;
    storage_policy?: { id: string; name: string; type: string; max_size: number };
}

/**
 * PUT /api/admin/file/upload 创建分片上传会话 → 远端 PUT /file/upload。
 * 返回 server 方式时用 session_id + chunk_size 逐块 POST。
 */
export function createAdminUploadSessionApi(body: {
    uri: string;
    size: number;
    policy_id: string;
    overwrite?: boolean;
}): Promise<AdminUploadSession> {
    return request<AdminUploadSession>("/api/admin/file/upload", { method: "PUT", body: JSON.stringify(body) });
}

/** POST /api/admin/file/upload/[sessionId]/[index] 上传一个分片（原始二进制） */
export function uploadAdminFileChunkApi(sessionId: string, index: number, chunk: Blob): Promise<unknown> {
    return request<unknown>(`/api/admin/file/upload/${encodeURIComponent(sessionId)}/${index}`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: chunk,
    });
}

/** POST /api/admin/direct-links 为文件生成公开直链，返回 [{ link, file_url }] */
export function createAdminDirectLinkApi(fileIds: string[]): Promise<{ link: string; file_url: string }[]> {
    return request<{ link: string; file_url: string }[]>("/api/admin/direct-links", {
        method: "POST",
        body: JSON.stringify({ file_ids: fileIds }),
    });
}

/** PUT /api/admin/file/rename 重命名文件或目录 */
export function renameAdminFileApi(id: string, newName: string): Promise<unknown> {
    return request("/api/admin/file/rename", { method: "PUT", body: JSON.stringify({ id, new_name: newName }) });
}

/** POST /api/admin/folder/move 移动文件/目录到目标目录 */
export function moveAdminFilesApi(sourceIDs: string[], destinationID: string): Promise<unknown> {
    return request("/api/admin/folder/move", {
        method: "POST",
        body: JSON.stringify({ sourceIDs, destinationID }),
    });
}

/** POST /api/admin/folder/copy 复制文件/目录到目标目录 */
export function copyAdminFilesApi(sourceIDs: string[], destinationID: string): Promise<unknown> {
    return request("/api/admin/folder/copy", {
        method: "POST",
        body: JSON.stringify({ sourceIDs, destinationID }),
    });
}

/** 目录树节点（远端 GET /folder/tree/:id；字段以实测为准，这里只取用到的） */
export interface AdminFolderTreeNode {
    id: string;
    name: string;
    path?: string;
    children?: AdminFolderTreeNode[];
}

/** GET /api/admin/folder/tree/[id] 目录树（「移动/复制」选目标目录用） */
export function getAdminFolderTreeApi(id: string): Promise<AdminFolderTreeNode[]> {
    return request(`/api/admin/folder/tree/${encodeURIComponent(id)}`, { method: "GET" });
}

/** 目录大小统计（远端 GET /folder/size/:id） */
export interface AdminFolderSize {
    logicalSize: number;
    storageConsumption: number;
    fileCount: number;
}

/** GET /api/admin/folder/size/[id] 计算目录大小（逻辑大小 / 占用空间 / 文件数） */
export function getAdminFolderSizeApi(id: string): Promise<AdminFolderSize> {
    return request(`/api/admin/folder/size/${encodeURIComponent(id)}`, { method: "GET" });
}

/** 下载地址（同源代理透传二进制，浏览器直接打开即下载） */
export function adminFileDownloadUrl(id: string): string {
    return `/api/admin/file/download/${encodeURIComponent(id)}`;
}

/**
 * 图片预览（大图）地址：复用下载代理 —— 同源、自动带 cookie、原样透传后端二进制，
 * 所以**不需要额外签名**，可以直接塞进 `<img src>`（Content-Disposition 对 img 无效）。
 */
export function adminFilePreviewUrl(id: string): string {
    return adminFileDownloadUrl(id);
}

/**
 * 把「资源路径」补成**能直接粘进浏览器打开的绝对地址**（域名一律取自环境变量，不写死）。
 *
 * 为什么需要单独一个函数：后端 `POST /direct-links` 返回的 `link` 是**站内相对路径**
 * （形如 `/api/f/xxx/name.png`），而 `NEXT_PUBLIC_API_URL` 结尾本身就带 `/api`
 * （本机 = `https://blog.ciraos.top/api`）—— 直接拼会拼出 `.../api/api/f/xxx` 这种重复前缀。
 *
 * 规则（按顺序）：
 *   1. 已经是绝对地址（`http://` / `https://` / 协议相对 `//`）→ 原样返回
 *   2. 以 `/api/` 开头（本站同源代理路径）→ 去掉那一段 `/api`，再接到 `NEXT_PUBLIC_API_URL` 后面
 *   3. 其它以 `/` 开头的路径（如缩略图签名 `/t/xxx`）→ 直接接在 `NEXT_PUBLIC_API_URL` 后面
 *   4. 其余（既不是绝对地址也不以 `/` 开头）→ 当相对路径处理，补一个 `/` 再拼
 *
 * 例：`/api/f/a/1.png` → `https://blog.ciraos.top/api/f/a/1.png`；`/t/sign` → `https://blog.ciraos.top/api/t/sign`。
 */
export function toAbsoluteApiUrl(path?: string | null): string {
    if (!path) return "";
    const value = path.trim();
    if (!value) return "";
    if (/^(https?:)?\/\//i.test(value)) return value;
    if (value.startsWith("/api/")) return `${API_URL}${value.slice("/api".length)}`;
    if (value.startsWith("/")) return `${API_URL}${value}`;
    return `${API_URL}/${value}`;
}

/**
 * GET /api/admin/thumbnail/[id] 取缩略图签名（远端 GET /thumbnail/:publicID，需登录）。
 * 后端不直接给缩略图地址，而是给一个签名 `sign`，再用 `${API_URL}/t/${sign}` 取图（该路径公开）。
 * 三种可能：200 就绪（有 sign）；202 正在生成；404 没有/已失败。
 *
 * 探活结论（2026-10-05，未登录直接打线上 `https://blog.ciraos.top/api`，只读）：
 *   GET /thumbnail/xxx       → 401（路由存在，需登录）= 下面这条路径就是对的；
 *   GET /thumbnail/sign/xxx  → 404（**不存在**）；
 *   而 scripts/swagger.yaml 里只有 `/thumbnail/sign/{publicID}`、没有 `/thumbnail/{id}`，
 *   且线上列表是单数 `/file`（swagger 写 `/files`）→ 该 swagger 与线上后端不是同一版本，别照它改。
 */
export async function getAdminThumbnailSignApi(
    id: string
): Promise<{ sign: string; expires?: string } | null> {
    const data = await request<{ sign?: string; expires?: string } | null>(
        `/api/admin/thumbnail/${encodeURIComponent(id)}`,
        { method: "GET" }
    );
    return data?.sign ? { sign: data.sign, expires: data.expires } : null;
}

/** 缩略图/预览图地址（sign 来自 getAdminThumbnailSignApi） */
export function adminThumbnailUrl(sign: string): string {
    return `${API_URL}/t/${sign}`;
}

/** 缩略图签名按文件 id 缓存（同一文件不必重复请求；null 表示确认没有缩略图） */
const thumbSignCache = new Map<string, string | null>();
const thumbSignInflight = new Map<string, Promise<string | null>>();

/** 取缩略图签名（带进程内缓存 + 并发去重）；没有缩略图时返回 null */
export async function getCachedThumbnailSignApi(id: string): Promise<string | null> {
    if (thumbSignCache.has(id)) return thumbSignCache.get(id) ?? null;
    const inflight = thumbSignInflight.get(id);
    if (inflight) return inflight;

    const task = (async () => {
        try {
            const res = await getAdminThumbnailSignApi(id);
            thumbSignCache.set(id, res?.sign ?? null);
            return res?.sign ?? null;
        } catch {
            // 404/202/网络异常：都按「暂时没有缩略图」处理，下次挂载可再试
            return null;
        } finally {
            thumbSignInflight.delete(id);
        }
    })();
    thumbSignInflight.set(id, task);
    return task;
}

// ===================== 打赏名单（PRO） =====================
//
// 后端把打赏放在闭源的 PRO 模块：远端真实路径是 /pro/admin/donations（增删改查）
// 与公开的 /pro/donations/total（总额）。浏览器端不能直连（无 CORS + 需鉴权），
// 统一经本应用同源代理 /api/admin/donations/* 转发（见 src/app/api/admin/donations/）。

/** GET /api/admin/donations 管理端打赏列表（分页 + 状态筛选） */
export async function getAdminDonationsApi(params: AdminDonationListParams = {}): Promise<DonationListData> {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
            qs.set(key, String(value));
        }
    }
    const query = qs.toString();
    return request<DonationListData>(`/api/admin/donations${query ? `?${query}` : ""}`, { method: "GET" });
}

/** GET /api/admin/donations/{id} 管理端获取单条打赏记录 */
export function getAdminDonationApi(id: number): Promise<Donation> {
    return request<Donation>(`/api/admin/donations/${id}`, { method: "GET" });
}

/** POST /api/admin/donations 管理端新增打赏记录 */
export function createAdminDonationApi(payload: AdminCreateDonationRequest): Promise<Donation> {
    return request<Donation>("/api/admin/donations", { method: "POST", body: JSON.stringify(payload) });
}

/** PUT /api/admin/donations/{id} 管理端更新打赏记录 */
export function updateAdminDonationApi(id: number, payload: AdminUpdateDonationRequest): Promise<Donation> {
    return request<Donation>(`/api/admin/donations/${id}`, { method: "PUT", body: JSON.stringify(payload) });
}

/** DELETE /api/admin/donations/{id} 管理端删除打赏记录 */
export function deleteAdminDonationApi(id: number): Promise<unknown> {
    return request<unknown>(`/api/admin/donations/${id}`, { method: "DELETE" });
}

/**
 * GET /api/admin/donations/total 打赏总额。
 * 说明：远端这条其实是**公开**接口 /pro/donations/total（无需登录），
 * 但管理端也要用，故仍走同源代理，避免浏览器直连后端（无 CORS）。
 */
export function getDonationTotalApi(): Promise<DonationTotalData> {
    return request<DonationTotalData>("/api/admin/donations/total", { method: "GET" });
}

// ===================== 订单（PRO） =====================
//
// 远端真实路径是闭源 PRO 模块的 /pro/admin/orders（列表）。
// 浏览器端不能直连（无 CORS + 需鉴权），统一经本应用同源代理 /api/admin/orders 转发
// （见 src/app/api/admin/orders/route.ts）。
// ⚠️ 响应里分页字段是 `size`；请求参数里分页字段才叫 `page_size`。

/** GET /api/admin/orders 管理端订单列表（转发远端 /pro/admin/orders） */
export async function getAdminOrdersApi(params: AdminOrderListParams = {}): Promise<AdminOrderListData> {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
            qs.set(key, String(value));
        }
    }
    const query = qs.toString();
    return request<AdminOrderListData>(`/api/admin/orders${query ? `?${query}` : ""}`, { method: "GET" });
}

// ===================== 商品（PRO） =====================
//
// 远端真实路径是闭源 PRO 模块的 /pro/admin/products（列表）。
// 同源代理 /api/admin/products（见 src/app/api/admin/products/route.ts）。
// 响应形状 { list, total, page, page_size }。

/** GET /api/admin/products 管理端商品列表（转发远端 /pro/admin/products） */
export async function getAdminProductsApi(params: AdminProductListParams = {}): Promise<ProductListData> {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
            qs.set(key, String(value));
        }
    }
    const query = qs.toString();
    return request<ProductListData>(`/api/admin/products${query ? `?${query}` : ""}`, { method: "GET" });
}

// ===================== 文档系列 =====================
//
// 远端路径 /doc-series（swagger：/doc-series、/doc-series/{id}、/doc-series/{id}/articles）。
// 同源代理 /api/admin/doc-series（见 src/app/api/admin/doc-series/route.ts）。
// ⚠️ 响应与请求的分页字段都是 `pageSize`（驼峰，不是 page_size）。

/** GET /api/admin/doc-series 文档系列列表（转发远端 /doc-series） */
export async function getAdminDocSeriesApi(params: AdminDocSeriesListParams = {}): Promise<DocSeriesListData> {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
            qs.set(key, String(value));
        }
    }
    const query = qs.toString();
    return request<DocSeriesListData>(`/api/admin/doc-series${query ? `?${query}` : ""}`, { method: "GET" });
}

// ===================== 存储策略 =====================
//
// 远端路径 /storage-policies（写接口：POST /storage-policies、PUT|DELETE /storage-policies/{id}）。
// 同源代理 /api/admin/storage-policies（见 src/app/api/admin/storage-policies/route.ts）。
// 响应形状 { list, total }：⚠️ 没有分页字段。

/** GET /api/admin/storage-policies 存储策略列表（转发远端 /storage-policies） */
export function getAdminStoragePoliciesApi(): Promise<StoragePolicyListData> {
    return request<StoragePolicyListData>("/api/admin/storage-policies", { method: "GET" });
}

// ===================== 主题（主题商城） =====================
//
// 远端路径 /theme/installed（已安装）与 /theme/official（官方）。
// 同源代理 /api/admin/themes/installed、/api/admin/themes/official
// （见 src/app/api/admin/themes/installed/route.ts、src/app/api/admin/themes/official/route.ts）。
// 响应形状 { list, total }：⚠️ 没有分页字段。

/** GET /api/admin/themes/installed 已安装主题列表（转发远端 /theme/installed） */
export function getAdminInstalledThemesApi(): Promise<ThemeListData> {
    return request<ThemeListData>("/api/admin/themes/installed", { method: "GET" });
}

/** GET /api/admin/themes/official 官方主题列表（转发远端 /theme/official） */
export function getAdminOfficialThemesApi(): Promise<ThemeListData> {
    return request<ThemeListData>("/api/admin/themes/official", { method: "GET" });
}
