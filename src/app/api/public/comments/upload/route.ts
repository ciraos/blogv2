import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

import { cookies } from "next/headers"

import { API_URL } from "@/lib/api"

// 上传评论图片：本应用同源路由，服务端转发 multipart 到远端 /public/comments/upload。
// 后端为 JWTAuthOptional（可选登录）：登录时把 token 带上作为 viewer_id，访客可不带（是否放行由后端策略决定）。
// 返回 { code, message, data: { id } }，id 为文件的公开 ID（字符串）。
export async function POST(request: NextRequest) {
    let formData: FormData
    try {
        formData = await request.formData()
    } catch {
        return NextResponse.json({ code: 400, message: "请求体格式错误（需 multipart/form-data）", data: null }, { status: 400 })
    }

    if (!formData.get("file")) {
        return NextResponse.json({ code: 400, message: "缺少 file 字段", data: null }, { status: 400 })
    }

    const cookieStore = await cookies()
    const token = cookieStore.get("token")?.value
    const headers = new Headers()
    if (token) {
        headers.set("Authorization", `Bearer ${token}`)
    }

    let res: Response
    try {
        // 直接透传 FormData（fetch 会自动设置 multipart boundary），不手动设 Content-Type
        res = await fetch(`${API_URL}/public/comments/upload`, {
            method: "POST",
            headers,
            body: formData,
            cache: "no-store",
        })
    } catch {
        return NextResponse.json({ code: 502, message: "无法连接后端服务", data: null }, { status: 502 })
    }

    const json: unknown = await res.json().catch(() => null)

    if (!res.ok || !json) {
        return NextResponse.json(
            {
                code: (json as { code?: number })?.code ?? res.status,
                message: (json as { message?: string })?.message || `图片上传失败（HTTP ${res.status}）`,
                data: null,
            },
            { status: res.status }
        )
    }

    return NextResponse.json(json)
}
