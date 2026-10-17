// 后台「缓存管理」页的数据层。
//
// 请求助手统一用 src/lib/api.ts 导出的 request / ApiError（不再自带副本）：
// 本页只需要打本站同源代理 /api/admin/cache 下的三个路由（由代理路由读 httpOnly cookie 带 Bearer 转发）。
//
// 远端真实路由（源码证据：scripts/anheyu/anheyu-app-main/cmd/server/cache_management.go:23-28）：
//   GET  /api/admin/cache/status
//   POST /api/admin/cache/revalidate   body: { type: "all" | "article" | "config" | "categories" | "tags" | "links", slug? }
//   POST /api/admin/cache/manage       body: { type: "page" | "image" | "index" }
// 对应本仓库代理：src/app/api/admin/cache/{status,revalidate,manage}/route.ts

import { request } from "@/lib/api";

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

// 兼容导出：本文件原先自带一个同形的 ApiError 类，现在统一指向 api.ts 的那一个。
// 调用方从 @/lib/api-cache 里 import ApiError 依然可用，且 instanceof 不再跨模块失效。
export { ApiError } from "@/lib/api";

/** GET /api/admin/cache/status —— 各块缓存的可用性与统计 */
export function getCacheStatusApi(): Promise<CacheStatus> {
    return request<CacheStatus>("/api/admin/cache/status", { method: "GET" });
}

/**
 * POST /api/admin/cache/revalidate —— 触发远端调用 Next.js /revalidate 清前端缓存。
 * type=article 时远端要求 slug 非空（handler.go:102-105），调用方需自己保证。
 */
export async function revalidateCacheApi(payload: { type: RevalidateType; slug?: string }): Promise<void> {
    await request<unknown>("/api/admin/cache/revalidate", {
        method: "POST",
        body: JSON.stringify(payload),
    });
}

/** POST /api/admin/cache/manage —— 按 type 清理某一块后端缓存 */
export async function manageCacheApi(type: CachePurgeType): Promise<void> {
    await request<unknown>("/api/admin/cache/manage", {
        method: "POST",
        body: JSON.stringify({ type }),
    });
}
