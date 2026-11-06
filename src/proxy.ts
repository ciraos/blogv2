import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { ACCESS_TOKEN_KEY } from "@/lib/auth";

// 登录后写入的 accessToken cookie 名（见 src/lib/auth.ts）
const TOKEN_COOKIE = ACCESS_TOKEN_KEY

// 远端后端地址（含 /api 前缀）。
// 与 lib/api 的派生规则保持一致：没配 NEXT_PUBLIC_API_URL 时回退成 SITE_URL + /api。
// 不能直接 import "@/lib/api"：中间件跑在 Edge 运行时，别把整包服务端模块拖进来。
const SITE_ORIGIN = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim().replace(/\/+$/, "")
const API_URL = ((process.env.NEXT_PUBLIC_API_URL ?? "").trim() || (SITE_ORIGIN ? `${SITE_ORIGIN}/api` : "")).replace(/\/+$/, "")

// 本站静态路由的第一段（构建时扫描 src/app 生成，见 next.config.ts 的 env.APP_STATIC_ROUTE_SEGMENTS）
const STATIC_SEGMENTS = new Set(
    (process.env.APP_STATIC_ROUTE_SEGMENTS ?? "").split(",").map((s) => s.trim()).filter(Boolean)
)

// 后端自定义页面存在性探测结果的短缓存（同一实例内避免重复打接口）
const PROBE_TTL_MS = 30_000
const probeCache = new Map<string, { exists: boolean; at: number }>()

/**
 * 后台「真实存在」的路由正则（构建时扫描 src/app/admin 生成，见 next.config.ts 的
 * env.APP_ADMIN_ROUTE_REGEXPS）。动态段已编译成 `[^/]+`，catch-all 不在其中。
 */
const ADMIN_ROUTES: RegExp[] = (() => {
  try {
    const raw = JSON.parse(process.env.APP_ADMIN_ROUTE_REGEXPS ?? "[]") as string[]
    return raw.map((src) => new RegExp(`^/${src}/?$`))
  } catch {
    return []
  }
})()

/** 该 /admin 路径是不是一个真实存在的后台页面（列表为空时一律按「存在」处理，避免误杀） */
function isKnownAdminRoute(pathname: string): boolean {
  if (ADMIN_ROUTES.length === 0) return true
  return ADMIN_ROUTES.some((re) => re.test(pathname))
}

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

    // 3. 后台不存在的路径 → rewrite 到后台内的 404 页，并带上**真 404 状态码**
    //
    // 为什么要放在这里：app/admin/[...rest]/page.tsx 能保证「404 界面套后台外壳」，
    // 但页面组件无法设置 HTTP 状态码（只能在中间件里定），于是 /admin/<乱写> 一直是 200 ——
    // 对爬虫、监控、前端 fetch 的错误分支都是错的语义。
    // 现在：路径不在「后台已存在的路由表」里 → 直接 404（状态码正确，外壳仍是后台的）。
    //
    // ⚠️ 必须先用 startsWith("/admin") 把范围锁死在后台：漏了这一步会把**全站**每个路径
    //    都当成「不存在的后台页」重写到 /admin/not-found-view，进而被后台 layout 的登录守卫
    //    统一踢到 /login（实测表现：/ 、/login 全 307 到 /login）。
    // 只处理 GET/HEAD：POST 等写请求被 rewrite 到页面没有意义。
    if (
        (request.method === "GET" || request.method === "HEAD") &&
        (pathname === "/admin" || pathname.startsWith("/admin/")) &&
        !isKnownAdminRoute(pathname)
    ) {
        return NextResponse.rewrite(new URL("/admin/not-found-view", request.url), { status: 404 })
    }

    // 4. 自定义页面不存在 → 这里直接返回真 404
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

    // 5. 注入当前路径，供服务端 layout 判断（如文章详情页跳过全局侧边栏）
    const response = NextResponse.next()
    response.headers.set("x-pathname", pathname)
    return response
}

export const config = {
    // 覆盖全站（除静态资源），以便注入 x-pathname
    matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|avif|ico)$).*)"],
}
