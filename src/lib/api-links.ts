// 友链排序（拖拽排序）专用客户端。
//
// 为什么单独开一个文件：src/lib/api.ts 是全局 API 客户端（2000+ 行、被大量组件引用），
// 本次改动不动它，所以这里带一个自给自足的小 fetch 助手，判定口径与 api.ts 的 request<T>
// 保持一致（HTTP 2xx 且业务 code 为 200 / 0 才算成功），失败一律抛 Error（消息可直接进 toast）。
//
// 请求都走本站同源路由 /api/admin/links/**（后端不开放 CORS，且需要 httpOnly cookie 里的 token），
// 由 src/app/api/admin/links/sort/route.ts 转发到远端 PUT /links/sort。

import type { FriendLink, LinkListData } from "@/types/links";

/** 单个排序项：字段名与后端 model.LinkSortItem 完全一致（见下方说明），两个都是数字 */
export interface LinkSortItem {
    id: number;
    sort_order: number;
}

interface ApiEnvelope<T> {
    code: number;
    message: string;
    data: T;
}

/** 同源路由请求：只解析 { code, message, data } 信封，成功返回 data，失败抛 Error */
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers = new Headers(options.headers);
    if (options.body && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
    }

    let res: Response;
    try {
        res = await fetch(path, { ...options, headers, cache: "no-store" });
    } catch {
        throw new Error("网络请求失败，请检查网络连接");
    }

    let json: ApiEnvelope<T> | null = null;
    try {
        json = (await res.json()) as ApiEnvelope<T>;
    } catch {
        // 非 JSON 响应，下面统一按失败处理
    }

    if (res.ok && json && (json.code === 200 || json.code === 0)) {
        return json.data;
    }
    throw new Error(json?.message || `请求失败（HTTP ${res.status}）`);
}

/**
 * GET /api/admin/links 取排序用的友链列表（同源代理 → 远端 GET /links）。
 * 不带任何筛选条件：排序是全局顺序，必须基于全量列表，否则只改「当前筛选出来的一页」会
 * 把别的友链挤乱。后端 pageSize 上限 1000（pkg/domain/model/link.go:6 的 lte=1000）。
 */
export async function getAdminLinksForSortApi(pageSize = 1000): Promise<LinkListData> {
    const qs = new URLSearchParams({ page: "1", pageSize: String(pageSize) });
    return request<LinkListData>(`/api/admin/links?${qs.toString()}`, { method: "GET" });
}

/**
 * PUT /api/admin/links/sort 批量提交新顺序（同源代理 → 远端 PUT /links/sort）。
 * 权威依据：
 *   - internal/infra/router/router.go:663                 linksAdmin.PUT("/sort", ...)
 *   - pkg/domain/model/link.go:234-243                    LinkSortItem{ id int, sort_order int }、items 至少 1 条
 *   - pkg/handler/link/handler.go:748-762                 ShouldBindJSON 后交给 service
 *   - internal/infra/persistence/ent/link_repo.go:492-513 事务内逐条 SetSortOrder（整值覆盖，不是增量）
 */
export async function updateAdminLinkSortApi(items: LinkSortItem[]): Promise<void> {
    await request<null>("/api/admin/links/sort", {
        method: "PUT",
        body: JSON.stringify({ items }),
    });
}

/**
 * 把「界面上的顺序」翻译成后端要的排序权重。
 *
 * 后端后台列表按 `sort_order DESC, id DESC` 排序（link_repo.go:97），也就是 sort_order 越大越靠前。
 * 因此这里让第 1 行拿 N、最后一行拿 1（全为正数且互不相同）：DESC 排出来的结果与界面顺序一致，
 * 也不会落到 0（0 是新建友链的默认值，容易和未排序的数据混在一起）。
 */
export function toLinkSortItems(links: FriendLink[]): LinkSortItem[] {
    const total = links.length;
    return links.map((link, index) => ({ id: link.id, sort_order: total - index }));
}

/** 比较两组友链的 id 顺序是否一致（用于判断是否有未保存的改动） */
export function isSameLinkOrder(a: FriendLink[], b: FriendLink[]): boolean {
    if (a.length !== b.length) return false;
    return a.every((link, index) => link.id === b[index]?.id);
}
