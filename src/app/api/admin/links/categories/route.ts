import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

import { API_URL } from "@/lib/api"
import { ACCESS_TOKEN_KEY } from "@/lib/auth"
import { authedProxyFetch } from "@/lib/admin-api"

// 管理员友链分类：GET 转发到远端 /links/categories（需登录）。
// 后端不开放 CORS 且需鉴权，由本路由读取 httpOnly cookie 中的 token 转发。
const REMOTE = `${API_URL}/links/categories`

export async function GET(request: NextRequest) {
    const token = request.cookies.get(ACCESS_TOKEN_KEY)?.value
    if (!token) {
        return NextResponse.json({ code: 401, message: "未登录", data: null }, { status: 401 })
    }

    let res: Response
    try {
        res = await fetch(REMOTE, {
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
 * POST /api/admin/links/categories 新建友链分类（同源代理 → 远端 POST /links/categories）。
 * body: { name, style: "card" | "list", description? }（style 后端必填）
 */
export async function POST(request: NextRequest) {
    let body: unknown
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ code: 400, message: "请求体格式错误", data: null }, { status: 400 })
    }
    return authedProxyFetch("/links/categories", { method: "POST", body: JSON.stringify(body) })
}
