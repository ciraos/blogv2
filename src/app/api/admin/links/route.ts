import type { NextRequest } from "next/server"

import { authedProxyFetch } from "@/lib/admin-api"

// 管理员友链列表：GET 转发到远端 /links（需登录），查询参数（page/pageSize/name/status/category_id/tag_id）原样透传。
// 纯 JSON 透传，统一走 authedProxyFetch（读 cookie → Bearer → 统一 {code,message,data} 信封）。
export async function GET(request: NextRequest) {
    const qs = request.nextUrl.searchParams.toString()
    return authedProxyFetch(`/links${qs ? `?${qs}` : ""}`, { method: "GET" })
}

// 新建友链：POST 转发到远端 /links（body 由远端校验，这里不解析）。
export async function POST(request: NextRequest) {
    const body = await request.text()
    return authedProxyFetch("/links", {
        method: "POST",
        body,
        headers: { "Content-Type": "application/json" },
    })
}
