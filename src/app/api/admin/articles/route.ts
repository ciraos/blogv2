import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { revalidateTag } from "next/cache"

import { adminProxyFetch } from "@/lib/admin-api"
import { API_URL, ARTICLES_TAG } from "@/lib/api"
import { ACCESS_TOKEN_KEY } from "@/lib/auth"

// 管理员获取文章列表：GET 转发到远端 /articles（分页，可用 page/pageSize 查询参数）。
// 后端不开放 CORS 且需鉴权，浏览器端不能直连，由本路由读取 httpOnly cookie 中的 token 转发。
const REMOTE = `${API_URL}/articles`

export async function GET(request: NextRequest) {    const token = request.cookies.get(ACCESS_TOKEN_KEY)?.value
    if (!token) {
        return NextResponse.json({ code: 401, message: "未登录", data: null }, { status: 401 })
    }

    const search = new URL(request.url).search
    let res: Response
    try {
        res = await fetch(`${REMOTE}${search}`, {
            method: "GET",
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
        })
    } catch {
        return NextResponse.json({ code: 502, message: "无法连接后端服务", data: null }, { status: 502 })
    }

    const json = await res.json().catch(() => null)
    if (!res.ok) {
        return NextResponse.json(
            { code: json?.code ?? res.status, message: json?.message || `请求失败（HTTP ${res.status}）`, data: null },
            { status: res.status }
        )
    }
    return NextResponse.json({ code: 200, message: json?.message || "ok", data: json?.data ?? null })
}

// 新建文章：POST 转发到远端 /articles（JSON body，成功后返回新文章详情）。
// 复用 authedProxyFetch：它负责读 httpOnly token cookie、补 Content-Type 与 401/502 处理。
export async function POST(request: NextRequest) {
    const body = await request.text()
    const res = await adminProxyFetch("/articles", { method: "POST", body })
    // 新建成功 → 立刻让「文章」相关缓存（列表/详情/归档/sitemap）失效。
    // 读接口的 revalidate(60s) 只是兜底上限；不清的话前台最多要等一分钟才看到新文章。
    if (res.ok) revalidateTag(ARTICLES_TAG, { expire: 0 })
    return res
}
