// 后台「知识库管理」页的数据层（PRO 模块，线上已激活）。
//
// 为什么自己写一个极小的同源 fetch 助手：src/lib/api.ts 的 request 未导出（模块私有），
// 而本页只需要打本站同源代理 /api/admin/knowledge/*（代理路由读 httpOnly cookie 带 Bearer 转发，
// 见 src/app/api/admin/knowledge/**/route.ts），所以照 src/lib/api-cache.ts 的写法另建一个助手，
// 不去改动 api.ts（那个文件同时被前台和几十个页面依赖）。
//
// 远端真实路由（证据：官方前端快照 scripts/theme/theme-anheyu-next-main/src/lib/api/knowledge.ts:16-73，
// BASE = "/api/pro/admin/knowledge"；线上只读探活 /api/pro/admin/knowledge/{documents,stats,config,
// supported-types,rebuild-status} 未登录均返回 401 = 路由存在、只是要鉴权）：
//   GET    /pro/admin/knowledge/documents?status&page&page_size
//   GET    /pro/admin/knowledge/documents/{id}
//   POST   /pro/admin/knowledge/documents              body { title, content, metadata? }
//   DELETE /pro/admin/knowledge/documents/{id}
//   DELETE /pro/admin/knowledge/documents/batch        body { ids }
//   POST   /pro/admin/knowledge/documents/{id}/reindex
//   POST   /pro/admin/knowledge/upload                 multipart（form-data，字段名 file）
//   DELETE /pro/admin/knowledge/clear
//   POST   /pro/admin/knowledge/sync-articles          body { force }
//   GET    /pro/admin/knowledge/{stats,config,supported-types,rebuild-status}

/** 索引状态（官方 types/knowledge.ts: KnowledgeDocumentStatus） */
export type KnowledgeDocumentStatus = "pending" | "processing" | "indexed" | "failed" | "disabled";

/** 来源类型（官方 types/knowledge.ts: KnowledgeSourceType） */
export type KnowledgeSourceType = "article" | "upload" | "custom" | "webpage";

/** 知识库文档（字段名与官方 KnowledgeDocument 严格对齐） */
export interface KnowledgeDocument {
    id: number;
    source_type: KnowledgeSourceType;
    source_id?: number;
    source_url?: string;
    title: string;
    content_type: string;
    content_length: number;
    status: KnowledgeDocumentStatus;
    chunk_count: number;
    error_message?: string;
    indexed_at?: string;
    created_at: string;
    updated_at: string;
}

/** 知识库总览统计（官方 KnowledgeStats） */
export interface KnowledgeStats {
    total_documents: number;
    indexed_documents: number;
    pending_documents: number;
    failed_documents: number;
    total_chunks: number;
    total_tokens: number;
}

/** 知识库运行配置（官方 KnowledgeConfig） */
export interface KnowledgeConfig {
    enabled: boolean;
    embedding_provider: string;
    embedding_model: string;
    vector_store: string;
    vector_dimension: number;
}

/**
 * 重建状态（官方 RebuildStatus）。
 * 注意：这个「重建」指后端切换 embedding provider/model 后的全量重嵌入，
 * 时间字段是 Unix 秒级时间戳（number），不是 ISO 字符串；0 表示未开始/未结束。
 */
export interface RebuildStatus {
    is_rebuilding: boolean;
    start_time: number;
    end_time: number;
    old_provider: string;
    old_model: string;
    new_provider: string;
    new_model: string;
    total_docs: number;
    processed_docs: number;
    failed_docs: number;
    error: string;
}

/**
 * 文档列表响应 data。
 * ⚠️ 顶层键是 documents / page_size（官方 ListKnowledgeDocumentsResponse），
 * 与打赏、文档系列那套 { list, pageSize } 不同，别写混。
 */
export interface KnowledgeDocumentList {
    documents: KnowledgeDocument[];
    total: number;
    page: number;
    page_size: number;
}

/** 批量删除结果（官方 BatchDeleteResult） */
export interface KnowledgeBatchDeleteResult {
    documents_deleted: number;
    chunks_deleted: number;
    failed_ids?: number[];
}

/** 清空结果（官方 ClearResult） */
export interface KnowledgeClearResult {
    documents_deleted: number;
    chunks_deleted: number;
    vectors_cleared: boolean;
}

/** 同步文章结果（官方 SyncArticlesResult） */
export interface KnowledgeSyncArticlesResult {
    total_articles: number;
    new_documents: number;
    updated_documents: number;
    skipped_documents: number;
    failed_documents: number;
}

/** 新建 / 索引文档的请求体（官方 IndexDocumentRequest） */
export interface KnowledgeIndexDocumentPayload {
    title: string;
    content: string;
    metadata?: Record<string, unknown>;
}

/** 列表查询参数（官方 ListKnowledgeDocumentsRequest：只有状态 + 分页，没有关键词字段） */
export interface KnowledgeDocumentQuery {
    status?: KnowledgeDocumentStatus;
    page?: number;
    page_size?: number;
}

/** 同源代理出错时抛出的错误（与 api.ts / api-cache.ts 的 ApiError 同名同形，便于调用方沿用同一套处理） */
export class KnowledgeApiError extends Error {
    status: number;
    code: number;

    constructor(message: string, status: number, code: number) {
        super(message);
        this.name = "KnowledgeApiError";
        this.status = status;
        this.code = code;
    }
}

/** 远端统一响应信封（pkg/response/response.go） */
interface KnowledgeEnvelope<T> {
    code: number;
    message: string;
    data: T;
}

/**
 * 打本站同源代理（路径以 /api/ 开头，浏览器自动带登录 cookie），
 * 按 api.ts 的同一套约定解包：HTTP 2xx 且业务 code 为 200/0 才算成功。
 */
async function knowledgeFetch<T>(path: string, init?: RequestInit): Promise<T> {
    const headers = new Headers(init?.headers);
    // FormData 不能手动设 Content-Type（要让 fetch 自己带 multipart boundary）
    if (init?.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
    }

    let res: Response;
    try {
        res = await fetch(path, { ...init, headers, cache: "no-store" });
    } catch {
        throw new KnowledgeApiError("网络请求失败，请检查网络连接", 0, 0);
    }

    let json: KnowledgeEnvelope<T> | null = null;
    try {
        json = (await res.json()) as KnowledgeEnvelope<T>;
    } catch {
        // 非 JSON 响应（例如代理整体 500 返回 HTML）→ 下面统一按 HTTP 状态报错
    }

    if (res.ok && json && (json.code === 200 || json.code === 0)) {
        return json.data;
    }
    throw new KnowledgeApiError(
        json?.message || `请求失败（HTTP ${res.status}）`,
        res.status,
        json?.code ?? res.status
    );
}

/** 把查询参数里的 undefined 去掉，避免拼出 ?status=undefined */
function toQueryString(params: Record<string, string | number | undefined>): string {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === "") continue;
        search.set(key, String(value));
    }
    const qs = search.toString();
    return qs ? `?${qs}` : "";
}

/** GET /api/admin/knowledge/documents —— 文档分页列表 */
export function getKnowledgeDocumentsApi(params: KnowledgeDocumentQuery = {}): Promise<KnowledgeDocumentList> {
    return knowledgeFetch<KnowledgeDocumentList>(
        `/api/admin/knowledge/documents${toQueryString({
            status: params.status,
            page: params.page,
            page_size: params.page_size,
        })}`,
        { method: "GET" }
    );
}

/** GET /api/admin/knowledge/documents/{id} —— 单个文档详情 */
export function getKnowledgeDocumentApi(id: number): Promise<KnowledgeDocument> {
    return knowledgeFetch<KnowledgeDocument>(`/api/admin/knowledge/documents/${id}`, { method: "GET" });
}

/** POST /api/admin/knowledge/documents —— 用标题 + 正文新建一个知识库文档 */
export function createKnowledgeDocumentApi(payload: KnowledgeIndexDocumentPayload): Promise<KnowledgeDocument> {
    return knowledgeFetch<KnowledgeDocument>("/api/admin/knowledge/documents", {
        method: "POST",
        body: JSON.stringify(payload),
    });
}

/** DELETE /api/admin/knowledge/documents/{id} —— 删除单个文档 */
export async function deleteKnowledgeDocumentApi(id: number): Promise<void> {
    await knowledgeFetch<unknown>(`/api/admin/knowledge/documents/${id}`, { method: "DELETE" });
}

/** DELETE /api/admin/knowledge/documents/batch —— 批量删除（body { ids }） */
export function batchDeleteKnowledgeDocumentsApi(ids: number[]): Promise<KnowledgeBatchDeleteResult> {
    return knowledgeFetch<KnowledgeBatchDeleteResult>("/api/admin/knowledge/documents/batch", {
        method: "DELETE",
        body: JSON.stringify({ ids }),
    });
}

/** DELETE /api/admin/knowledge/clear —— 清空整个知识库 */
export function clearKnowledgeApi(): Promise<KnowledgeClearResult> {
    return knowledgeFetch<KnowledgeClearResult>("/api/admin/knowledge/clear", { method: "DELETE" });
}

/** POST /api/admin/knowledge/documents/{id}/reindex —— 单文档重建索引 */
export function reindexKnowledgeDocumentApi(id: number): Promise<KnowledgeDocument> {
    return knowledgeFetch<KnowledgeDocument>(`/api/admin/knowledge/documents/${id}/reindex`, { method: "POST" });
}

/** POST /api/admin/knowledge/upload —— 上传单个文件（multipart，字段名 file） */
export function uploadKnowledgeDocumentApi(file: File): Promise<KnowledgeDocument> {
    const formData = new FormData();
    formData.append("file", file);
    return knowledgeFetch<KnowledgeDocument>("/api/admin/knowledge/upload", {
        method: "POST",
        body: formData,
    });
}

/** POST /api/admin/knowledge/sync-articles —— 同步站点文章进知识库（force=true 强制重嵌入） */
export function syncKnowledgeArticlesApi(force = false): Promise<KnowledgeSyncArticlesResult> {
    return knowledgeFetch<KnowledgeSyncArticlesResult>("/api/admin/knowledge/sync-articles", {
        method: "POST",
        body: JSON.stringify({ force }),
    });
}

/** GET /api/admin/knowledge/stats —— 总览统计 */
export function getKnowledgeStatsApi(): Promise<KnowledgeStats> {
    return knowledgeFetch<KnowledgeStats>("/api/admin/knowledge/stats", { method: "GET" });
}

/** GET /api/admin/knowledge/config —— 运行配置（provider / model / 向量库 / 维度） */
export function getKnowledgeConfigApi(): Promise<KnowledgeConfig> {
    return knowledgeFetch<KnowledgeConfig>("/api/admin/knowledge/config", { method: "GET" });
}

/** GET /api/admin/knowledge/supported-types —— 支持的文件扩展名（用于上传 accept） */
export function getKnowledgeSupportedTypesApi(): Promise<string[]> {
    return knowledgeFetch<{ types: string[] }>("/api/admin/knowledge/supported-types", { method: "GET" }).then(
        (data) => data.types ?? []
    );
}

/** GET /api/admin/knowledge/rebuild-status —— 全量重嵌入进度（切换模型后由后端异步跑） */
export function getKnowledgeRebuildStatusApi(): Promise<RebuildStatus> {
    return knowledgeFetch<RebuildStatus>("/api/admin/knowledge/rebuild-status", { method: "GET" });
}
