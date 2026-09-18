import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

import { cookies } from "next/headers"

import { API_URL, getCommentsWithChildrenApi } from "@/lib/api"

interface CommentCreateResponse {
    code: number
    message: string
    data: unknown
}

// 提交评论：本应用同源路由，服务端转发到远端 /public/comments（公开，可选登录）。
// 后端不开放 CORS，浏览器端不能直连，须经本路由转发。
//
// 必须转发登录态：后端该接口是 JWTAuthOptional（可选登录），
// 只有带上 Authorization 后端才知道「用管理员邮箱评论的是管理员本人」；
// 不带就被当作游客，一旦邮箱命中管理员邮箱会被直接拒绝（constant.ErrAdminEmailUsedByGuest
// → 403「此邮箱为管理员专属」），即使用户在本站已登录。
export async function POST(request: NextRequest) {
    let body: Record<string, unknown>
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ code: 400, message: "请求体格式错误", data: null }, { status: 400 })
    }

    const cookieStore = await cookies()
    const token = cookieStore.get("token")?.value

    const headers = new Headers({ "Content-Type": "application/json" })
    if (token) {
        headers.set("Authorization", `Bearer ${token}`)
    }

    let res: Response
    try {
        res = await fetch(`${API_URL}/public/comments`, {
            method: "POST",
            headers,
            body: JSON.stringify(body),
            cache: "no-store",
        })
    } catch {
        return NextResponse.json({ code: 502, message: "无法连接后端服务", data: null }, { status: 502 })
    }

    const json: CommentCreateResponse | null = await res.json().catch(() => null)

    if (!res.ok || !json) {
        return NextResponse.json(
            {
                code: json?.code ?? res.status,
                message: json?.message || `评论提交失败（HTTP ${res.status}）`,
                data: null,
            },
            { status: res.status }
        )
    }

    return NextResponse.json(json)
}

// GET /api/public/comments?target_path=...（同源代理，转发远端 /public/comments 并合并子评论）。
// 供客户端在提交成功后重新拉取列表（后端不开放 CORS，必须经此代理）。
export async function GET(request: NextRequest) {
    const sp = new URL(request.url).searchParams
    const targetPath = sp.get("target_path") ?? ""
    const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1)
    const pageSize = Math.max(1, parseInt(sp.get("pageSize") ?? "20", 10) || 20)

    if (!targetPath) {
        return NextResponse.json({ code: 400, message: "缺少 target_path", data: null }, { status: 400 })
    }

    const comments = await getCommentsWithChildrenApi(targetPath, { page, pageSize })
    return NextResponse.json({ code: 200, message: "ok", data: comments })
}
