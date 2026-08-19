import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const AUTH_COOKIES = ["token", "refresh_token", "user_info"]

// 清除认证 cookie（手动写 Set-Cookie，属性与 login 写入时一致）
function clearAuthCookies(response: Response) {
    const attrs = "Path=/; Max-Age=0; HttpOnly; SameSite=Lax"
    for (const name of AUTH_COOKIES) {
        response.headers.append("Set-Cookie", `${name}=; ${attrs}`)
    }
}

// 登出：清除认证 cookie。
// 默认跳转登录页；带 ?redirect=0 时仅返回 JSON（供前端原地刷新，不跳转）
// 注意：跳转必须用相对 Location（浏览器按当前页面域名解析）——
// 部署在反向代理后 request.url 是容器内网地址，new URL(x, request.url) 会跳去内网
export async function GET(request: NextRequest) {
    const noRedirect = request.nextUrl.searchParams.get("redirect") === "0"

    if (noRedirect) {
        const response = NextResponse.json({ code: 200, message: "已登出", data: null })
        clearAuthCookies(response)
        return response
    }

    const response = new Response(null, { status: 307, headers: { Location: "/login" } })
    clearAuthCookies(response)
    return response
}
