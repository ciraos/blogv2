import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

import { API_URL } from "@/lib/api"
import { ACCESS_TOKEN_KEY } from "@/lib/auth"

// 管理员获取文章列表：GET 转发到远端 /articles（分页，可用 page/pageSize 查询参数）。
// 后端不开放 CORS 且需鉴权，浏览器端不能直连，由本路由读取 httpOnly cookie 中的 token 转发。
const REMOTE = `${API_URL}/articles`

export async function GET(request: NextRequest) {
    const token = request.cookies.get(ACCESS_TOKEN_KEY)?.value
    if (!token) {
        return NextResponse.json({ code: 401, message: "未登录", data: null }, { status: 401 })
    }

    const search = new URL(request.url).search
    let res: Response
    try {
        res = await fetch(`${REMOTE}${search}`, {
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
