import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

// 登录后写入的 accessToken cookie 名（见 src/lib/auth.ts）
const TOKEN_COOKIE = "token"

export function proxy(request: NextRequest) {
    const token = request.cookies.get(TOKEN_COOKIE)?.value
    const { pathname } = request.nextUrl

    // 1. 已登录用户访问登录页 → 跳转后台
    if (pathname === "/login" && token) {
        return NextResponse.redirect(new URL("/admin/dashboard", request.url))
    }

    // 2. 未登录用户访问后台 → 跳转登录页
    if (pathname.startsWith("/admin") && !token) {
        return NextResponse.redirect(new URL("/login", request.url))
    }

    return NextResponse.next()
}

export const config = {
    matcher: ["/admin/:path*", "/login"],
}
