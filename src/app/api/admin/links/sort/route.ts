import type { NextRequest } from "next/server"

import { authedProxyFetch } from "@/lib/admin-api"

// 管理员批量更新友链排序：PUT /api/admin/links/sort → 远端 PUT /links/sort
//
// 请求体契约（以 Go 后端为准，字段名是 sort_order，不是 sort）：
//   { items: [{ id: number, sort_order: number }] }，items 至少 1 条
// 权威依据：
//   - internal/infra/router/router.go:663                 linksAdmin.PUT("/sort", ...)
//   - pkg/domain/model/link.go:234-243                    LinkSortItem{ id int `json:"id"`、sort_order int `json:"sort_order"` }
//   - pkg/handler/link/handler.go:748-762                 ShouldBindJSON → service
//   - internal/infra/persistence/ent/link_repo.go:492-513 事务内逐条 SetSortOrder（整值覆盖，不是增量）
//
// 说明一：静态段 sort 优先于同级的 [id] 动态段，所以这个 PUT 不会被「单条更新友链」路由吃掉。
// 说明二：这里先做一次本地形状校验，不合格直接 400 返回，既不打扰远端，也避免把脏数据写进线上。

/** 本地校验后的排序项（与远端 model.LinkSortItem 同构） */
interface SortItem {
    id: number
    sort_order: number
}

/** 统一的 400 返回 */
function badRequest(message: string): Response {
    return Response.json({ code: 400, message, data: null }, { status: 400 })
}

export async function PUT(request: NextRequest) {
    let body: unknown
    try {
        body = await request.json()
    } catch {
        return badRequest("请求体格式错误")
    }

    const rawItems: unknown = (body as { items?: unknown } | null)?.items
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
        return badRequest("缺少要排序的 items（至少 1 条）")
    }

    const items: SortItem[] = []
    for (const raw of rawItems as unknown[]) {
        if (typeof raw !== "object" || raw === null) {
            return badRequest("排序项格式错误：每一项都必须是 { id, sort_order }")
        }
        const { id, sort_order: sortOrder } = raw as { id?: unknown; sort_order?: unknown }
        // 远端对 id 是 binding:"required" 的 int，0 同样不合法，所以这里要求正整数
        if (typeof id !== "number" || !Number.isInteger(id) || id <= 0) {
            return badRequest("排序项 id 必须是正整数")
        }
        if (typeof sortOrder !== "number" || !Number.isInteger(sortOrder)) {
            return badRequest("排序项 sort_order 必须是整数")
        }
        items.push({ id, sort_order: sortOrder })
    }

    return authedProxyFetch("/links/sort", { method: "PUT", body: JSON.stringify({ items }) })
}
