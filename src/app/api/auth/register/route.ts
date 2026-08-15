import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

import { API_URL } from "@/lib/api"

interface RegisterResponse {
    code: number
    message: string
    data: unknown
}

// 注册：本应用同源路由，服务端转发到远端 /auth/register（无需鉴权）
export async function POST(request: NextRequest) {
    let body: { nickname?: string; email?: string; password?: string; repeat_password?: string }
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ code: 400, message: "请求体格式错误", data: null }, { status: 400 })
    }

    const { nickname, email, password, repeat_password } = body ?? {}

    // 本地校验（与远端规则保持一致；实测后端要求 nickname 必填）
    if (!nickname || !email || !password || !repeat_password) {
        return NextResponse.json({ code: 400, message: "请输入昵称、邮箱、密码和确认密码", data: null }, { status: 400 })
    }
    if (password.length < 6) {
        return NextResponse.json({ code: 400, message: "密码长度至少 6 位", data: null }, { status: 400 })
    }
    if (password !== repeat_password) {
        return NextResponse.json({ code: 400, message: "两次输入的密码不一致", data: null }, { status: 400 })
    }

    let res: Response
    try {
        res = await fetch(`${API_URL}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ nickname, email, password, repeat_password }),
            cache: "no-store",
        })
    } catch {
        return NextResponse.json({ code: 502, message: "无法连接后端服务", data: null }, { status: 502 })
    }

    const json: RegisterResponse | null = await res.json().catch(() => null)

    // 失败：透传远端错误
    if (!res.ok || !json) {
        return NextResponse.json(
            {
                code: json?.code ?? res.status,
                message: json?.message || `注册失败（HTTP ${res.status}）`,
                data: null,
            },
            { status: res.status }
        )
    }

    return NextResponse.json(json)
}
