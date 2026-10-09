// 文档系列 · 写操作 + 系列文章（自带 fetch 助手，不动 src/lib/api.ts）
//
// 远端契约（scripts/anheyu/anheyu-app-main）：
//  - POST   /doc-series              { name, description, cover_url, sort }（router.go:338；
//      pkg/domain/model/docseries.go:29-34，name 必填）→ data: DocSeriesResponse
//  - PUT    /doc-series/{id}         四字段均可选（docseries.go:37-42）→ data: DocSeriesResponse
//  - DELETE /doc-series/{id}         → data: null（router.go:340）
//  - GET    /public/doc-series/{id}/articles → data: DocSeriesWithArticles（router.go:330；
//      docseries.go:64-77；只含「已发布 + is_doc」的文章，doc_series_repo.go:159-167）
//
// 系列文章的加入 / 移出没有专用接口，官方前端是在文章编辑器里改这两个字段
// （theme-anheyu-next-main/src/components/admin/article-editor/use-article-meta.ts:145-146），
// 对应远端 PUT /articles/{id} 的 is_doc / doc_series_id：
//  - 加入：{ is_doc: true, doc_series_id: "<系列公共ID>" }
//    （pkg/service/article/service.go:1662-1693 会同步维护 doc_count）；
//  - 移出：{ doc_series_id: "" } → 仓储层 ClearDocSeriesID（article_repo.go:859-869），
//    刻意**不改 is_doc**：文章仍是「文档」，只是不属于任何系列（官方前台 DocDetailContent.tsx:68
//    在没有 doc_series_id 时不会再去拉系列）。
//
// 浏览器端一律走同源代理（/api/admin/doc-series/**、/api/admin/articles/{id}）。
import { ApiError } from "@/lib/api";
import type { DocSeries } from "@/types/doc-series";

/** 系列文章列表项（远端 model.DocArticleItem，docseries.go:70-77） */
export interface DocSeriesArticleItem {
    id: string;
    title: string;
    abbrlink: string;
    doc_sort: number;
    created_at: string;
}

/** 系列 + 名下文章（远端 model.DocSeriesWithArticles，docseries.go:64-68） */
export interface DocSeriesWithArticles extends DocSeries {
    articles: DocSeriesArticleItem[];
}

/** 新建 / 更新系列的请求体（字段名与官方 DocSeriesFormModal.tsx:63-68 一致） */
export interface DocSeriesFormPayload {
    name: string;
    description: string;
    cover_url: string;
    sort: number;
}

/** 更新时允许只传改动项 */
export type DocSeriesUpdatePayload = Partial<DocSeriesFormPayload>;

interface Envelope<T> {
    code: number;
    message: string;
    data: T;
}

/**
 * 同源代理请求助手（与 src/lib/api.ts 的 request 同口径：HTTP 2xx 且业务 code 为 200/0 才算成功）。
 * 这里自带一份是为了不动 api.ts —— 本文件的路径全部是本站 /api/ 开头的相对地址。
 */
async function proxyRequest<T>(path: string, options: RequestInit): Promise<T> {
    const headers = new Headers(options.headers);
    if (options.body && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
    }

    let res: Response;
    try {
        res = await fetch(path, { ...options, headers, cache: "no-store" });
    } catch {
        throw new ApiError("网络请求失败，请检查网络连接", 0, 0);
    }

    let json: Envelope<T> | null = null;
    try {
        json = (await res.json()) as Envelope<T>;
    } catch {
        // 非 JSON 响应
    }

    if (res.ok && json && (json.code === 200 || json.code === 0)) {
        return json.data;
    }
    throw new ApiError(json?.message || `请求失败（HTTP ${res.status}）`, res.status, json?.code ?? res.status);
}

/** POST /api/admin/doc-series 新建文档系列（⚠️ 写操作） */
export function createAdminDocSeriesApi(payload: DocSeriesFormPayload): Promise<DocSeries> {
    return proxyRequest<DocSeries>("/api/admin/doc-series", {
        method: "POST",
        body: JSON.stringify(payload),
    });
}

/** PUT /api/admin/doc-series/{id} 更新文档系列（⚠️ 写操作，可只传改动项） */
export function updateAdminDocSeriesApi(id: string, payload: DocSeriesUpdatePayload): Promise<DocSeries> {
    return proxyRequest<DocSeries>(`/api/admin/doc-series/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: JSON.stringify(payload),
    });
}

/**
 * DELETE /api/admin/doc-series/{id} 删除文档系列（⚠️ 写操作）。
 * 远端会拒绝删除仍有文档的系列（service.go:134-143），错误文案直接透传给调用方。
 */
export function deleteAdminDocSeriesApi(id: string): Promise<unknown> {
    return proxyRequest<unknown>(`/api/admin/doc-series/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/** GET /api/admin/doc-series/{id}/articles 取系列及其名下文章（只读） */
export function getAdminDocSeriesArticlesApi(id: string): Promise<DocSeriesWithArticles> {
    return proxyRequest<DocSeriesWithArticles>(`/api/admin/doc-series/${encodeURIComponent(id)}/articles`, {
        method: "GET",
    });
}

/**
 * 把一篇文章加入某系列（⚠️ 写操作：PUT /articles/{id}，只传文档相关字段做部分更新）。
 * 文章是草稿也不会出现在系列文章列表里（远端列表只查已发布，doc_series_repo.go:163）。
 */
export function addArticleToDocSeriesApi(articleId: string, seriesId: string): Promise<unknown> {
    return proxyRequest<unknown>(`/api/admin/articles/${encodeURIComponent(articleId)}`, {
        method: "PUT",
        body: JSON.stringify({ is_doc: true, doc_series_id: seriesId }),
    });
}

/** 把一篇文章移出系列（⚠️ 写操作：doc_series_id 传空串，仓储层会清空该列） */
export function removeArticleFromDocSeriesApi(articleId: string): Promise<unknown> {
    return proxyRequest<unknown>(`/api/admin/articles/${encodeURIComponent(articleId)}`, {
        method: "PUT",
        body: JSON.stringify({ doc_series_id: "" }),
    });
}
