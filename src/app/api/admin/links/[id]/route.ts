import type { NextRequest } from "next/server"

import { authedProxyFetch } from "@/lib/admin-api"

// 管理员友链单条操作（同源代理，读取 httpOnly cookie 里的 token 转发到远端）：
//   PUT    /api/admin/links/{id} → 远端 PUT    /links/{id}  更新友链
//   DELETE /api/admin/links/{id} → 远端 DELETE /links/{id}  删除友链
// 后端不开放 CORS 且需鉴权，浏览器端不能直连，因此统一走这里。
const REMOTE = "/links"

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params

    let body: unknown
    try {
        body = await request.json()
    } catch {
        return Response.json({ code: 400, message: "请求体格式错误", data: null }, { status: 400 })
    }

    return authedProxyFetch(`${REMOTE}/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(body) })
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    return authedProxyFetch(`${REMOTE}/${encodeURIComponent(id)}`, { method: "DELETE" })
}
