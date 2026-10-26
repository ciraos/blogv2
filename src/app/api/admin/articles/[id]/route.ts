import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { revalidateTag } from "next/cache"

import { adminProxyFetch } from "@/lib/admin-api"
import { ARTICLES_TAG } from "@/lib/api"

/**
 * 单篇文章的管理端同源代理（远端 /articles/{id}）。
 * - GET：编辑页回填用（拿 content_md / 分类 / 标签 / 状态等）
 * - PUT：保存编辑
 * - DELETE：删除
 * 三者都复用 authedProxyFetch：读取 httpOnly token cookie、带 Bearer 转发、统一 401/502 处理。
 */
interface RouteContext {
    params: Promise<{ id: string }>
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
    const { id } = await params
    return adminProxyFetch(`/articles/${encodeURIComponent(id)}`, { method: "GET" })
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
    const { id } = await params
    const body = await request.text()
    const res = await adminProxyFetch(`/articles/${encodeURIComponent(id)}`, { method: "PUT", body })
    // 保存成功 → 文章缓存立刻失效（含该篇的二级标签），前台马上能看到改动
    if (res.ok) revalidateTag(ARTICLES_TAG, { expire: 0 })
    return res
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
    const { id } = await params
    const res = await adminProxyFetch(`/articles/${encodeURIComponent(id)}`, { method: "DELETE" })
    if (res.ok) revalidateTag(ARTICLES_TAG, { expire: 0 })
    // 删除成功时后端可能返回空 body，authedProxyFetch 会包成 { code, message }，这里统一成 data: null
    if (res.status === 200) {
        return NextResponse.json({ code: 200, message: "删除成功", data: null })
    }
    return res
}
