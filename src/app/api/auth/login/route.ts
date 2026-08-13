import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

import { API_URL } from "@/lib/api"
import { ACCESS_TOKEN_KEY, ACCESS_TOKEN_MAX_AGE, REFRESH_TOKEN_KEY, REFRESH_TOKEN_MAX_AGE } from "@/lib/auth"

interface LoginResponse {
    code: number
    message: string
    data: {
        accessToken: string
        expires: string
        refreshToken: string
        roles: string[]
        userInfo: unknown
    } | null
}

// 登录：本应用同源路由，服务端转发到远端 /auth/login，成功后写入 httpOnly cookie
export async function POST(request: NextRequest) {
    let body: { email?: string; password?: string }
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ code: 400, message: "请求体格式错误", data: null }, { status: 400 })
    }

    const { email, password } = body ?? {}
    if (!email || !password) {
        return NextResponse.json({ code: 400, message: "请输入邮箱和密码", data: null }, { status: 400 })
    }

    let res: Response
    try {
        res = await fetch(`${API_URL}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
            cache: "no-store",
        })
    } catch {
        return NextResponse.json({ code: 502, message: "无法连接后端服务", data: null }, { status: 502 })
    }

    const json: LoginResponse | null = await res.json().catch(() => null)

    // 登录失败：透传远端错误
    if (!res.ok || !json?.data) {
        return NextResponse.json(
            {
                code: json?.code ?? res.status,
                message: json?.message || `登录失败（HTTP ${res.status}）`,
                data: null,
            },
            { status: res.status }
        )
    }

    // 登录成功：写入 httpOnly cookie，不向客户端返回 token
    const response = NextResponse.json({ code: 200, message: "登录成功", data: null })
    response.cookies.set(ACCESS_TOKEN_KEY, json.data.accessToken, {
        path: "/",
        maxAge: ACCESS_TOKEN_MAX_AGE,
        httpOnly: true,
        sameSite: "lax",
    })
    response.cookies.set(REFRESH_TOKEN_KEY, json.data.refreshToken, {
        path: "/",
        maxAge: REFRESH_TOKEN_MAX_AGE,
        httpOnly: true,
        sameSite: "lax",
    })
    return response
}
