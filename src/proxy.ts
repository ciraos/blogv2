import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

// 登录后写入的 accessToken cookie 名（见 src/lib/auth.ts）
const TOKEN_COOKIE = "token"

/**
 * 构造跳转：优先用反向代理透传的 X-Forwarded-Host/Proto（公共域名），
 * 本地开发回退到 request.nextUrl.origin。
 * 不能直接用 request.url / request.nextUrl.origin —— 反向代理下它们是容器内网地址
 * （如 https://<容器ID>:3126），会把用户带到无法访问的内网地址。
 */
function redirectTo(request: NextRequest, path: string): NextResponse {
    const forwardedHost = request.headers.get("x-forwarded-host") || null
    const host = forwardedHost ?? request.headers.get("host")
    const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https"
    const origin = host ? `${proto}://${host}` : request.nextUrl.origin
    return NextResponse.redirect(new URL(path, origin))
}

export function proxy(request: NextRequest) {
    const token = request.cookies.get(TOKEN_COOKIE)?.value
    const { pathname } = request.nextUrl

    // 1. 已登录用户访问登录页 → 跳转后台
    if (pathname === "/login" && token) {
        return redirectTo(request, "/admin/dashboard")
    }

    // 2. 未登录用户访问后台 → 跳转登录页
    if (pathname.startsWith("/admin") && !token) {
        return redirectTo(request, "/login")
    }

    return NextResponse.next()
}

export const config = {
    matcher: ["/admin/:path*", "/login"],
}
