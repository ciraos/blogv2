import type { NextRequest } from "next/server"

import { authedProxyFetch } from "@/lib/admin-api"

// 管理员批量删除友链：DELETE /api/admin/links/batch-delete → 远端 DELETE /links/batch-delete
// body: { ids: number[] }（远端限制 1~100 条），返回 { total, success, failed, failed_list }。
// 说明：静态段 batch-delete 优先于同级的 [id] 动态段，所以不会被单条删除路由吃掉。
export async function DELETE(request: NextRequest) {
    let body: unknown
    try {
        body = await request.json()
    } catch {
        return Response.json({ code: 400, message: "请求体格式错误", data: null }, { status: 400 })
    }

    const ids = (body as { ids?: unknown } | null)?.ids
    if (!Array.isArray(ids) || ids.length === 0) {
        return Response.json({ code: 400, message: "缺少要删除的友链 ids", data: null }, { status: 400 })
    }
    if (ids.length > 100) {
        return Response.json({ code: 400, message: "一次最多删除 100 条友链", data: null }, { status: 400 })
    }

    return authedProxyFetch("/links/batch-delete", { method: "DELETE", body: JSON.stringify({ ids }) })
}
