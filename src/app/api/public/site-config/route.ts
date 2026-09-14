import { NextResponse } from "next/server"

import { API_URL } from "@/lib/api"

// GET /api/public/site-config：本站同源代理，服务端转发到远端 /public/site-config（公开，无需鉴权）。
// 后端不开放 CORS，浏览器端不能直连，需经本路由取得站点公开配置（如 comment.anonymous_email/blogger_email）。
export async function GET() {
    let res: Response
    try {
        res = await fetch(`${API_URL}/public/site-config`, { cache: "no-store" })
    } catch {
        return NextResponse.json({ code: 502, message: "无法连接后端服务", data: null }, { status: 502 })
    }

    const json = await res.json().catch(() => null)
    if (!res.ok || !json) {
        return NextResponse.json(
            { code: json?.code ?? res.status, message: json?.message || `请求失败（HTTP ${res.status}）`, data: null },
            { status: res.status }
        )
    }
    return NextResponse.json(json)
}
