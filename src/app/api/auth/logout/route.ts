import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

// 登出：清除认证 cookie 并跳转登录页
export async function GET(request: NextRequest) {
    const response = NextResponse.redirect(new URL("/login", request.url))
    response.cookies.set("token", "", { path: "/", maxAge: 0 })
    response.cookies.set("refresh_token", "", { path: "/", maxAge: 0 })
    response.cookies.set("user_info", "", { path: "/", maxAge: 0 })
    return response
}
