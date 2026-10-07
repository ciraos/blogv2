import type { NextRequest } from "next/server"

import { authedProxyFetch } from "@/lib/admin-api"

// 导出友链（同源代理 → 远端 GET /links/export，需管理员登录）。
// 查询参数与列表接口同口径（name / url / description / status / category_id / tag_id），留空即全部。
// 远端返回 { links: ImportLinkItem[], total }，与导入接口同构（可直接回灌导入）。
export async function GET(request: NextRequest) {
    const qs = request.nextUrl.searchParams.toString()
    return authedProxyFetch(`/links/export${qs ? `?${qs}` : ""}`, { method: "GET" })
}
