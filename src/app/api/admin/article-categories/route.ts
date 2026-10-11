import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

import { API_URL } from "@/lib/api"
import { ACCESS_TOKEN_KEY } from "@/lib/auth"

// 管理员文章分类（远端 /post-categories，文章专用）：
//   GET  /api/admin/article-categories → 远端 GET  /post-categories（列表，含 id）
//   POST /api/admin/article-categories → 远端 POST /post-categories（新建，name 必填）
// 单条改名 / 删除见同目录 [id]/route.ts。
// 后端不开放 CORS，由本路由读取 httpOnly cookie 中的 token 转发。
const REMOTE = `${API_URL}/post-categories`

export async function GET(request: NextRequest) {
    const token = request.cookies.get(ACCESS_TOKEN_KEY)?.value
    if (!token) {
        return NextResponse.json({ code: 401, message: "未登录", data: null }, { status: 401 })
    }

    let res: Response
    try {
        res = await fetch(REMOTE, {
            method: "GET",
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
        })
    } catch {
        return NextResponse.json({ code: 502, message: "无法连接后端服务", data: null }, { status: 502 })
    }

    const json = await res.json().catch(() => null)
    if (!res.ok) {
        return NextResponse.json(
            { code: json?.code ?? res.status, message: json?.message || `请求失败（HTTP ${res.status}）`, data: null },
            { status: res.status }
        )
    }
    return NextResponse.json({ code: 200, message: json?.message || "ok", data: json?.data ?? null })
}

/**
 * POST /api/admin/article-categories 新建分类（同源代理 → 远端 POST /post-categories，需管理员）。
 * 远端契约（router.go:318、pkg/handler/post_category/handler.go:31-51）：
 *   body = model.CreatePostCategoryRequest { name（必填）、slug?、description?、is_series?、sort_order? }
 *   → data = model.PostCategoryResponse
 * 只做「名称」必填校验；slug 留空由后端生成。
 */
export async function POST(request: NextRequest) {
    let raw: unknown
    try {
        raw = await request.json()
    } catch {
        return NextResponse.json({ code: 400, message: "请求体格式错误（需 JSON）", data: null }, { status: 400 })
    }
    if (typeof raw !== "object" || raw === null) {
        return NextResponse.json({ code: 400, message: "请求体必须是 JSON 对象", data: null }, { status: 400 })
    }

    const name = (raw as { name?: unknown }).name
    if (typeof name !== "string" || name.trim() === "") {
        return NextResponse.json({ code: 400, message: "分类名称不能为空", data: null }, { status: 400 })
    }

    const token = request.cookies.get(ACCESS_TOKEN_KEY)?.value
    if (!token) {
        return NextResponse.json({ code: 401, message: "未登录", data: null }, { status: 401 })
    }

    let res: Response
    try {
        res = await fetch(REMOTE, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify(raw),
            cache: "no-store",
        })
    } catch {
        return NextResponse.json({ code: 502, message: "无法连接后端服务", data: null }, { status: 502 })
    }

    const json: unknown = await res.json().catch(() => null)
    if (!res.ok || !json) {
        return NextResponse.json(
            {
                code: (json as { code?: number } | null)?.code ?? res.status,
                message: (json as { message?: string } | null)?.message || `创建分类失败（HTTP ${res.status}）`,
                data: null,
            },
            { status: res.status }
        )
    }
    return NextResponse.json(json, { status: 200 })
}
