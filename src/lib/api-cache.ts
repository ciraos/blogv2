// 后台「缓存管理」页的数据层。
//
// 为什么不复用 src/lib/api.ts 的 request 助手：那个函数没有导出（模块私有），
// 而本页只需要打本站同源代理 /api/admin/cache 下的三个路由（由代理路由读 httpOnly cookie 带 Bearer 转发），
// 所以这里自己写一个极小的同源 fetch 助手，避免为了一个页面去改动 api.ts（也不该改）。
//
// 远端真实路由（源码证据：scripts/anheyu/anheyu-app-main/cmd/server/cache_management.go:23-28）：
//   GET  /api/admin/cache/status
//   POST /api/admin/cache/revalidate   body: { type: "all" | "article" | "config" | "categories" | "tags" | "links", slug? }
//   POST /api/admin/cache/manage       body: { type: "page" | "image" | "index" }
// 对应本仓库代理：src/app/api/admin/cache/{status,revalidate,manage}/route.ts

/** 单块缓存的可用性 / 统计（page、index、ssr 都是这个形状，字段可选以兼容后端演进） */
export interface CacheStatusDetail {
    /** 该块缓存是否启用 */
    available?: boolean;
    /** 索引类缓存专有：健康检查是否通过 */
    healthy?: boolean;
    /** page 缓存专有：内存缓存条目数 */
    entries?: number;
    /** 后端读取统计失败时的说明（如 image.error = "无法读取缓存统计"） */
    error?: string;
    /** image 缓存专有：单个策略的统计（shape 见 ImageCacheStats） */
    stats?: ImageCacheStats;
}

/**
 * 图片派生缓存统计。
 * 字段来自远端 Go DTO `image_style.CacheStats`（pkg/service/image_style/types.go:147-160），
 * 目前线上还没有鉴权后的真实响应可对照，故按该 DTO 命名实现。
 */
export interface ImageCacheStats {
    policy_id?: number;
    /** 缓存占用字节数（per-policy） */
    total_size?: number;
    /** 缓存条目数（per-policy） */
    count?: number;
    /** 进程级全局命中次数（注意：不是 per-policy 口径） */
    hit_count?: number;
    /** 进程级全局未命中次数 */
    miss_count?: number;
    /** 预留的 per-policy 命中计数（当前版本恒为 0） */
    policy_hit_count?: number;
    /** 预留的 per-policy 未命中计数（当前版本恒为 0） */
    policy_miss_count?: number;
}

/**
 * GET /api/admin/cache/status 的业务数据。
 * 顶层 enabled 是旧版 swagger 的形状（缓存清理服务是否可用），
 * 新版由 Configure 回调注入的 ssr.available 表达同一语义；两个都声明为可选，谁有就展示谁。
 */
export interface CacheStatus {
    enabled?: boolean;
    /** 页面内存缓存（frontend.PageCacheStatus） */
    page?: CacheStatusDetail;
    /** 搜索索引（search.AppSearcher） */
    index?: CacheStatusDetail;
    /** 图片派生缓存（image_style.DiskCache） */
    image?: CacheStatusDetail;
    /** Next.js SSR 重新验证（cache_service.RevalidateService） */
    ssr?: CacheStatusDetail;
    /** 运行时设置项，当前后端恒为空数组 */
    runtime_settings?: string[];
}

/** 重新验证的粒度（与远端 handler.RevalidateRequest 的 oneof 完全一致） */
export type RevalidateType = "all" | "article" | "config" | "categories" | "tags" | "links";

/** 可清理的缓存类型（与远端 Configure 注册的 actions 键完全一致） */
export type CachePurgeType = "page" | "image" | "index";

/** 同源代理出错时抛出的错误（与 api.ts 的 ApiError 同名同形，便于调用方沿用同一套处理） */
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

/** 远端统一响应信封（pkg/response/response.go） */
interface ProxyEnvelope<T> {
    code: number;
    message: string;
    data: T;
}

/**
 * 打本站同源代理（路径以 /api/ 开头，浏览器会自动带上登录 cookie），
 * 按 api.ts 的同一套约定解包：HTTP 2xx 且业务 code 为 200/0 才算成功。
 */
async function fetchCacheApi<T>(path: string, init?: RequestInit): Promise<T> {
    const headers = new Headers(init?.headers);
    if (init?.body && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
    }

    let res: Response;
    try {
        res = await fetch(path, { ...init, headers, cache: "no-store" });
    } catch {
        throw new ApiError("网络请求失败，请检查网络连接", 0, 0);
    }

    let json: ProxyEnvelope<T> | null = null;
    try {
        json = (await res.json()) as ProxyEnvelope<T>;
    } catch {
        // 非 JSON 响应（例如代理整体 500 返回 HTML）→ 下面统一按 HTTP 状态报错
    }

    if (res.ok && json && (json.code === 200 || json.code === 0)) {
        return json.data;
    }
    throw new ApiError(json?.message || `请求失败（HTTP ${res.status}）`, res.status, json?.code ?? res.status);
}

/** GET /api/admin/cache/status —— 各块缓存的可用性与统计 */
export function getCacheStatusApi(): Promise<CacheStatus> {
    return fetchCacheApi<CacheStatus>("/api/admin/cache/status", { method: "GET" });
}

/**
 * POST /api/admin/cache/revalidate —— 触发远端调用 Next.js /revalidate 清前端缓存。
 * type=article 时远端要求 slug 非空（handler.go:102-105），调用方需自己保证。
 */
export async function revalidateCacheApi(payload: { type: RevalidateType; slug?: string }): Promise<void> {
    await fetchCacheApi<unknown>("/api/admin/cache/revalidate", {
        method: "POST",
        body: JSON.stringify(payload),
    });
}

/** POST /api/admin/cache/manage —— 按 type 清理某一块后端缓存 */
export async function manageCacheApi(type: CachePurgeType): Promise<void> {
    await fetchCacheApi<unknown>("/api/admin/cache/manage", {
        method: "POST",
        body: JSON.stringify({ type }),
    });
}
