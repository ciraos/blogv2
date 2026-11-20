import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

import { API_URL } from "@/lib/api"

// 最新评论（热评）：评论弹幕用。同一源转发到远端 GET /public/comments/latest。
// 后端不开放 CORS，浏览器端必须经本路由。
export async function GET(request: NextRequest) {
    const qs = request.nextUrl.searchParams.toString()
    const remote = `${API_URL}/public/comments/latest${qs ? `?${qs}` : ""}`

    let res: Response
    try {
        res = await fetch(remote, { cache: "no-store" })
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
    // 透传原结构（含 pagination），客户端只读 data.list
    return NextResponse.json({ code: 200, message: json?.message || "ok", data: json?.data ?? null })
}
