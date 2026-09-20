import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

// 登录后写入的 accessToken cookie 名（见 src/lib/auth.ts）
const TOKEN_COOKIE = "token"

// 远端后端地址（NEXT_PUBLIC_API_URL 已含 /api 前缀）
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? ""

// 本站静态路由的第一段（构建时扫描 src/app 生成，见 next.config.ts 的 env.APP_STATIC_ROUTE_SEGMENTS）
const STATIC_SEGMENTS = new Set(
    (process.env.APP_STATIC_ROUTE_SEGMENTS ?? "").split(",").map((s) => s.trim()).filter(Boolean)
)

/** 后端自定义页面存在性探测结果的短缓存（同一实例内避免重复打接口） */
const PROBE_TTL_MS = 30_000
const probeCache = new Map<string, { exists: boolean; at: number }>()

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

/**
 * 该路径是否可能是「后端自定义页面」（后台 → 页面管理里建的页面）。
 * 排除：根路径、下划线内部路径、静态文件（末段带扩展名）、本站已有静态路由、/api 与 /admin。
 */
function isCustomPageCandidate(pathname: string): boolean {
    if (!pathname || pathname === "/") return false
    const segments = pathname.split("/").filter(Boolean)
    const first = segments[0] ?? ""
    if (!first || first.startsWith("_")) return false
    if (first === "api" || first === "admin") return false
    if (STATIC_SEGMENTS.has(first)) return false
    const last = segments[segments.length - 1] ?? ""
    if (last.includes(".")) return false // robots.txt / sitemap.xml / 图片等
    return true
}

/**
 * 问后端该路径的自定义页面是否存在（GET /public/pages/{path}）。
 * 返回 null 表示「无法判定」（接口异常/网络故障）—— 此时放行，交给兜底页面按老逻辑处理。
 */
async function customPageExists(pathname: string): Promise<boolean | null> {
    if (!API_URL) return null

    const cached = probeCache.get(pathname)
    if (cached && Date.now() - cached.at < PROBE_TTL_MS) return cached.exists

    try {
        const clean = pathname.replace(/^\/+/, "")
        const res = await fetch(`${API_URL}/public/pages/${encodeURIComponent(clean)}`, {
            headers: { Accept: "application/json" },
            cache: "no-store",
        })
        // 只有「后端明确说没有」才算不存在；其它错误（401/500/网络）一律放行，避免误伤
        if (res.status === 404) {
            probeCache.set(pathname, { exists: false, at: Date.now() })
            return false
        }
        if (!res.ok) return null

        const json = await res.json().catch(() => null)
        const exists = Boolean(json?.data?.is_published)
        probeCache.set(pathname, { exists, at: Date.now() })
        return exists
    } catch {
        return null
    }
}

export async function proxy(request: NextRequest) {
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

    // 3. 自定义页面不存在 → 这里直接返回真 404
    //
    // 为什么要放在中间件：自定义页面由 (blog)/[...slug] 兜底渲染，页面内调用 notFound() 时
    // 响应早已开始流式输出（根 loading.tsx 是 Suspense 边界），状态码改不了，只能返回 200
    // （Next 官方文档：not-found.md / loading.md 的 Status Codes 一节）。
    // 在中间件里先判存在性，就能在流式开始前给出真正的 404；
    // 重写到 Next 内部 404 路由是为了复用站点自己的 404 UI（状态码仍为 404）。
    if ((request.method === "GET" || request.method === "HEAD") && isCustomPageCandidate(pathname)) {
        const exists = await customPageExists(pathname)
        if (exists === false) {
            return NextResponse.rewrite(new URL("/_not-found", request.url), { status: 404 })
        }
    }

    // 4. 注入当前路径，供服务端 layout 判断（如文章详情页跳过全局侧边栏）
    const response = NextResponse.next()
    response.headers.set("x-pathname", pathname)
    return response
}

export const config = {
    // 覆盖全站（除静态资源），以便注入 x-pathname
    matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|avif|ico)$).*)"],
}
