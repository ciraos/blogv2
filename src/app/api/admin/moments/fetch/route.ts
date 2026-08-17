import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

import { API_URL } from "@/lib/api"
import { ACCESS_TOKEN_KEY } from "@/lib/auth"

// 朋友圈 RSS 抓取：POST 手动触发（需登录）。
// 后端不开放 CORS 且需鉴权，浏览器端不能直连，由本路由读取 httpOnly cookie 中的
// accessToken 转发到远端 POST /pro/admin/moments/fetch。
const REMOTE = `${API_URL}/pro/admin/moments/fetch`

export async function POST(request: NextRequest) {
    const token = request.cookies.get(ACCESS_TOKEN_KEY)?.value
    if (!token) {
        return NextResponse.json({ code: 401, message: "未登录", data: null }, { status: 401 })
    }

    let res: Response
    try {
        res = await fetch(REMOTE, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
        })
    } catch {
        return NextResponse.json({ code: 502, message: "无法连接后端服务", data: null }, { status: 502 })
    }

    const json = await res.json().catch(() => null)
    if (!res.ok) {
        return NextResponse.json(
            { code: json?.code ?? res.status, message: json?.message || `触发失败（HTTP ${res.status}）`, data: null },
            { status: res.status }
        )
    }
    return NextResponse.json({ code: 200, message: json?.message || "已触发抓取", data: json?.data ?? null })
}
