import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

import { API_URL } from "@/lib/api"
import { ACCESS_TOKEN_KEY, ACCESS_TOKEN_MAX_AGE, REFRESH_TOKEN_KEY, REFRESH_TOKEN_MAX_AGE } from "@/lib/auth"

interface OAuthCallbackData {
    token?: string
    refresh_token?: string
    expires_at?: number
    user?: { nickname?: string; avatar?: string; email?: string }
    is_new_user?: boolean
    need_binding?: boolean
    binding_token?: string
}

/**
 * 第三方登录 · 回调：GET /api/pro/oauth/{provider}/callback?code=&state=&type=
 * → 远端 GET /pro/oauth/{provider}/callback（PRO 专属接口）。
 *
 * 和后端约定一样：成功时返回 token / refresh_token。这里**不把 token 交给浏览器**，
 * 而是照抄 `/api/auth/login` 的做法写 httpOnly cookie，前端只需拿到「成功 + 是否新用户」。
 */
export async function GET(request: NextRequest, context: { params: Promise<{ provider: string }> }) {
    const { provider } = await context.params
    const qs = request.nextUrl.searchParams.toString()

    let res: Response
    try {
        res = await fetch(`${API_URL}/pro/oauth/${encodeURIComponent(provider)}/callback${qs ? `?${qs}` : ""}`, {
            cache: "no-store",
        })
    } catch {
        return NextResponse.json({ code: 502, message: "无法连接后端服务", data: null }, { status: 502 })
    }

    const json: { code?: number; message?: string; data?: OAuthCallbackData } | null = await res.json().catch(() => null)

    if (!res.ok || !json?.data) {
        return NextResponse.json(
            { code: json?.code ?? res.status, message: json?.message || `回调失败（HTTP ${res.status}）`, data: null },
            { status: res.status }
        )
    }

    const data = json.data

    // 需要绑定已有账号：不写 cookie，把提示带回前端
    if (data.need_binding) {
        return NextResponse.json({
            code: 200,
            message: "该第三方账号尚未绑定本站账号",
            data: { need_binding: true, is_new_user: false },
        })
    }

    if (!data.token) {
        return NextResponse.json({ code: 500, message: "回调成功但未返回令牌", data: null }, { status: 500 })
    }

    const response = NextResponse.json({
        code: 200,
        message: "登录成功",
        // 只回「展示需要的信息」，token 留在 cookie 里
        data: {
            need_binding: false,
            is_new_user: data.is_new_user === true,
            user: data.user ?? null,
        },
    })

    response.cookies.set(ACCESS_TOKEN_KEY, data.token, {
        path: "/",
        maxAge: ACCESS_TOKEN_MAX_AGE,
        httpOnly: true,
        sameSite: "lax",
    })
    if (data.refresh_token) {
        response.cookies.set(REFRESH_TOKEN_KEY, data.refresh_token, {
            path: "/",
            maxAge: REFRESH_TOKEN_MAX_AGE,
            httpOnly: true,
            sameSite: "lax",
        })
    }
    return response
}
