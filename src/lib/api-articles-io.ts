// 文章管理「导入 / 导出 / 批量删除 + 分类标签管理」专用的同源 fetch 助手。
//
// 为什么另起一个文件而不是写进 lib/api.ts：
//   lib/api.ts 是全局公共模块（首页 / 前台 / 用户中心都在用），本文件只服务后台文章管理，
//   单独放可以避免为了这几个接口去动公共文件。
//
// 后端不开放 CORS，浏览器必须走同源 /api/admin/* 代理；代理再带上 httpOnly cookie 里的 token
// 转发到远端（见 src/app/api/admin/articles/*/route.ts）。
//
// 远端契约（源码为准）：
//   POST   /articles/import  multipart（字段 file / create_categories / create_tags / skip_existing /
//                            default_status）—— router.go:377、pkg/handler/article/handler.go:869-955
//   POST   /articles/export  JSON { article_ids: string[] } → application/zip 文件流 —— handler.go:748-792
//   DELETE /articles/batch   JSON { ids: string[] }（1..100） —— handler.go:794-850、service.go:39-43
//   POST|PUT|DELETE /post-categories[/{id}]、/post-tags[/{id}] —— router.go:301-321

/** 远端统一响应信封 { code, message, data } */
interface ApiEnvelope<T> {
    code: number;
    message: string;
    data: T;
}

/** 调用后台接口失败时抛出的错误（message 直接可展示给用户） */
export class ArticleApiError extends Error {
    status: number;
    code: number;

    constructor(message: string, status: number, code: number) {
        super(message);
        this.name = "ArticleApiError";
        this.status = status;
        this.code = code;
    }
}

/** 后端 response.Fail 返回的是 HTTP 状态码本身（200/400/401/500…），按 code===200 判成功 */
function unwrap<T>(envelope: ApiEnvelope<T>, httpStatus: number): T {
    if (envelope.code !== 200) {
        throw new ArticleApiError(envelope.message || "请求失败", httpStatus, envelope.code);
    }
    return envelope.data;
}

/**
 * 请求一个同源代理路由并解出信封里的 data。
 * 用法限定在 /api/admin/article-* 这几个 JSON 接口上；导出走 requestRaw（二进制流）。
 */
async function requestJson<T>(path: string, init: RequestInit): Promise<T> {
    const headers = new Headers(init.headers);
    if (init.body && !(init.body instanceof FormData)) {
        headers.set("Content-Type", "application/json");
    }

    let res: Response;
    try {
        res = await fetch(path, { ...init, headers, cache: "no-store" });
    } catch {
        throw new ArticleApiError("网络请求失败，请检查网络连接", 0, 0);
    }

    let envelope: ApiEnvelope<T> | null = null;
    try {
        envelope = (await res.json()) as ApiEnvelope<T>;
    } catch {
        // 非 JSON 响应（例如代理被中间层拦截）
    }

    if (!envelope) {
        throw new ArticleApiError(`请求失败（HTTP ${res.status}）`, res.status, res.status);
    }
    return unwrap(envelope, res.status);
}

/** 请求一个返回文件流（非 JSON 信封）的同源代理路由，失败时仍按 JSON 信封解错误信息 */
async function requestRaw(path: string, init: RequestInit): Promise<Response> {
    let res: Response;
    try {
        res = await fetch(path, { ...init, cache: "no-store" });
    } catch {
        throw new ArticleApiError("网络请求失败，请检查网络连接", 0, 0);
    }

    if (!res.ok) {
        let message = `请求失败（HTTP ${res.status}）`;
        try {
            const envelope = (await res.json()) as Partial<ApiEnvelope<unknown>>;
            if (envelope?.message) message = envelope.message;
        } catch {
            // 非 JSON 错误体，保留通用提示
        }
        throw new ArticleApiError(message, res.status, res.status);
    }

    return res;
}

// ===================== 文章导入 =====================

/** 远端 article.ImportResult（脚本 scripts/swagger.yaml:2-26、service/article/import_export_service.go:85-92） */
export interface ArticleImportResult {
    total_count: number;
    success_count: number;
    skipped_count: number;
    failed_count: number;
    errors: string[] | null;
    created_ids: string[] | null;
}

/** 导入选项，与远端 handlers 读取的表单字段一一对应（handler.go:915-918） */
export interface ArticleImportOptions {
    /** 分类不存在时自动创建（后端默认 true） */
    create_categories: boolean;
    /** 标签不存在时自动创建（后端默认 true） */
    create_tags: boolean;
    /** 跳过已存在的文章（按 abbrlink / 标题判断，后端默认 true） */
    skip_existing: boolean;
    /** 数据里没写状态时的默认状态（后端默认 DRAFT） */
    default_status: string;
}

/** POST /api/admin/articles/import —— 导入会批量写文章表，属高危操作 */
export async function importAdminArticlesApi(file: File, options: ArticleImportOptions): Promise<ArticleImportResult> {
    const form = new FormData();
    form.append("file", file);
    form.append("create_categories", String(options.create_categories));
    form.append("create_tags", String(options.create_tags));
    form.append("skip_existing", String(options.skip_existing));
    form.append("default_status", options.default_status);

    return requestJson<ArticleImportResult>("/api/admin/articles/import", { method: "POST", body: form });
}

// ===================== 文章导出 =====================

/** 一次导出的最大篇数（后端未设上限，这里只防手滑传出超大请求） */
const EXPORT_MAX_IDS = 1000;

/**
 * POST /api/admin/articles/export —— 远端返回 application/zip 文件流，
 * 代理已透传 Content-Disposition，这里把文件名一并带回去给下载用。
 */
export async function exportAdminArticlesApi(
    articleIds: string[]
): Promise<{ blob: Blob; filename: string }> {
    if (articleIds.length === 0) {
        throw new ArticleApiError("请至少选择一篇文章再导出", 400, 400);
    }
    if (articleIds.length > EXPORT_MAX_IDS) {
        throw new ArticleApiError(`单次最多导出 ${EXPORT_MAX_IDS} 篇文章`, 400, 400);
    }

    const res = await requestRaw("/api/admin/articles/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ article_ids: articleIds }),
    });

    const disposition = res.headers.get("Content-Disposition");
    return { blob: await res.blob(), filename: filenameFromDisposition(disposition) };
}

/** 从 Content-Disposition 里取文件名（远端是 ASCII 的 articles_export_YYYYmmdd_HHMMSS.zip） */
export function filenameFromDisposition(disposition: string | null): string {
    const fallback = `articles_export_${new Date().toISOString().slice(0, 10)}.zip`;
    if (!disposition) return fallback;
    const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
    if (utf8?.[1]) {
        try {
            return decodeURIComponent(utf8[1].trim());
        } catch {
            // 编码异常就用下面的普通 filename
        }
    }
    const plain = /filename="?([^";]+)"?/i.exec(disposition);
    return plain?.[1]?.trim() || fallback;
}

// ===================== 批量删除 =====================

/** 远端 articleSvc.BatchDeleteResult（service/article/service.go:39-43） */
export interface ArticleBatchDeleteResult {
    success_count: number;
    failed_count: number;
    failed_ids: string[] | null;
}

/** 后端硬限制：单次最多删除 100 篇（handler.go:828-836），前端按此分片 */
export const ARTICLE_BATCH_DELETE_MAX = 100;

/** DELETE /api/admin/articles/batch —— body 形状 { ids: string[] }（远端 BatchDelete 只认 ids） */
export async function batchDeleteAdminArticlesApi(articleIds: string[]): Promise<ArticleBatchDeleteResult> {
    if (articleIds.length === 0) {
        throw new ArticleApiError("请先勾选要删除的文章", 400, 400);
    }
    if (articleIds.length > ARTICLE_BATCH_DELETE_MAX) {
        throw new ArticleApiError(`单次最多删除 ${ARTICLE_BATCH_DELETE_MAX} 篇文章`, 400, 400);
    }

    return requestJson<ArticleBatchDeleteResult>("/api/admin/articles/batch", {
        method: "DELETE",
        body: JSON.stringify({ ids: articleIds }),
    });
}

/**
 * 超过 100 篇时自动分片，累计各片结果。
 * 已删除的文章再删会走 failed_ids（后端逐篇 Delete，不整体回滚），由调用方决定是否重试。
 */
export async function batchDeleteAdminArticlesChunked(articleIds: string[]): Promise<ArticleBatchDeleteResult> {
    const chunks: string[][] = [];
    for (let i = 0; i < articleIds.length; i += ARTICLE_BATCH_DELETE_MAX) {
        chunks.push(articleIds.slice(i, i + ARTICLE_BATCH_DELETE_MAX));
    }

    const total: ArticleBatchDeleteResult = { success_count: 0, failed_count: 0, failed_ids: [] };
    for (const chunk of chunks) {
        const part = await batchDeleteAdminArticlesApi(chunk);
        total.success_count += part.success_count;
        total.failed_count += part.failed_count;
        total.failed_ids = [...(total.failed_ids ?? []), ...(part.failed_ids ?? [])];
    }
    return total;
}

// ===================== 分类 / 标签管理 =====================

/** 与 types/articles.ts 的 PostCategory 同构，这里独立声明避免跨模块耦合 */
export interface PostCategoryIO {
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

/** 与 types/articles.ts 的 PostTag 同构 */
export interface PostTagIO {
    id: string;
    created_at: string;
    updated_at: string;
    name: string;
    slug: string;
    count: number;
}

/** 创建分类 / 更新分类的载荷（远端 model.CreatePostCategoryRequest / UpdatePostCategoryRequest） */
export interface PostCategoryPayload {
    name?: string;
    slug?: string;
    description?: string;
    is_series?: boolean;
    sort_order?: number;
}

/** 创建标签 / 更新标签的载荷（远端 model.CreatePostTagRequest / UpdatePostTagRequest） */
export interface PostTagPayload {
    name?: string;
    slug?: string;
}

/** POST /api/admin/article-categories 新建分类（name 必填） */
export async function createAdminArticleCategoryApi(payload: PostCategoryPayload): Promise<PostCategoryIO> {
    return requestJson<PostCategoryIO>("/api/admin/article-categories", {
        method: "POST",
        body: JSON.stringify(payload),
    });
}

/** PUT /api/admin/article-categories/[id] 更新分类 */
export async function updateAdminArticleCategoryApi(
    id: string,
    payload: PostCategoryPayload
): Promise<PostCategoryIO> {
    return requestJson<PostCategoryIO>(`/api/admin/article-categories/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: JSON.stringify(payload),
    });
}

/** DELETE /api/admin/article-categories/[id] 删除分类 */
export async function deleteAdminArticleCategoryApi(id: string): Promise<null> {
    return requestJson<null>(`/api/admin/article-categories/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/** POST /api/admin/article-tags 新建标签（name 必填） */
export async function createAdminArticleTagApi(payload: PostTagPayload): Promise<PostTagIO> {
    return requestJson<PostTagIO>("/api/admin/article-tags", { method: "POST", body: JSON.stringify(payload) });
}

/** PUT /api/admin/article-tags/[id] 更新标签 */
export async function updateAdminArticleTagApi(id: string, payload: PostTagPayload): Promise<PostTagIO> {
    return requestJson<PostTagIO>(`/api/admin/article-tags/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: JSON.stringify(payload),
    });
}

/** DELETE /api/admin/article-tags/[id] 删除标签 */
export async function deleteAdminArticleTagApi(id: string): Promise<null> {
    return requestJson<null>(`/api/admin/article-tags/${encodeURIComponent(id)}`, { method: "DELETE" });
}
