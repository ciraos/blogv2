import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

import { API_URL } from "@/lib/api"

// 退订代理：GET 转发到远端 /public/unsubscribe/{token}（邮件里的退订链接）。
// 直接用后端地址会跨域且暴露后端域名，所以统一走这个同源路由。
export async function GET(_request: NextRequest, context: { params: Promise<{ token: string }> }) {
    const { token } = await context.params

    let res: Response
    try {
        res = await fetch(`${API_URL}/public/unsubscribe/${encodeURIComponent(token)}`, { cache: "no-store" })
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
