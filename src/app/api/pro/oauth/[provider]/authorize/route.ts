import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

import { API_URL } from "@/lib/api"

/**
 * 第三方登录 · 获取授权地址：POST /api/pro/oauth/{provider}/authorize
 * → 远端 POST /pro/oauth/{provider}/authorize（PRO 专属接口）。
 *
 * 后端返回 `{ authorize_url | url, state, type }`，前端拿到后整页跳过去。
 * 没有登录态也能调（这是登录入口本身），所以不带 token 转发。
 */
export async function POST(request: NextRequest, context: { params: Promise<{ provider: string }> }) {
    const { provider } = await context.params

    let body: unknown
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ code: 400, message: "请求体格式错误", data: null }, { status: 400 })
    }

    let res: Response
    try {
        res = await fetch(`${API_URL}/pro/oauth/${encodeURIComponent(provider)}/authorize`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body ?? {}),
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
