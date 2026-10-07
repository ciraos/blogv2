import type { NextRequest } from "next/server"

import { authedProxyFetch } from "@/lib/admin-api"

// 批量导入友链（同源代理 → 远端 POST /links/import，需管理员登录）：
//   body: { links: ImportLinkItem[], skip_duplicates?, create_categories?, create_tags?, default_category_id? }
//   返回 { total, success, failed, skipped, success_list, failed_list, skipped_list }（逐项统计）
// 浏览器端不能直连后端（无 CORS + 需鉴权），统一经本路由带 httpOnly cookie 里的 token 转发。
export async function POST(request: NextRequest) {
    let body: unknown
    try {
        body = await request.json()
    } catch {
        return Response.json({ code: 400, message: "请求体格式错误", data: null }, { status: 400 })
    }

    return authedProxyFetch("/links/import", { method: "POST", body: JSON.stringify(body) })
}
