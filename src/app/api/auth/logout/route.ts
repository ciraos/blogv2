import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

// 登出：清除认证 cookie。
// 默认跳转登录页；带 ?redirect=0 时仅返回 JSON（供前端原地刷新，不跳转）
export async function GET(request: NextRequest) {
    const noRedirect = request.nextUrl.searchParams.get("redirect") === "0"

    const response = noRedirect
        ? NextResponse.json({ code: 200, message: "已登出", data: null })
        : NextResponse.redirect(new URL("/login", request.url))

    response.cookies.set("token", "", { path: "/", maxAge: 0 })
    response.cookies.set("refresh_token", "", { path: "/", maxAge: 0 })
    response.cookies.set("user_info", "", { path: "/", maxAge: 0 })
    return response
}
