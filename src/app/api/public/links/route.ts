import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { revalidateTag } from "next/cache"

import { API_URL, LINKS_TAG } from "@/lib/api"

// 友链申请代理：POST 转发到远端 /public/links。
// 后端不开放 CORS，浏览器端（友链申请表单）需经本路由转发。
// 注意：API_URL 已含 /api 前缀，这里不能再拼 /api。
const REMOTE = `${API_URL}/public/links`

export async function POST(request: NextRequest) {
    let body: unknown
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ code: 400, message: "请求体格式错误", data: null }, { status: 400 })
    }

    let res: Response
    try {
        res = await fetch(REMOTE, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
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
    // 申请提交成功：友链列表（含「全状态」视图）缓存立刻失效，
    // 否则管理员在后台看不到刚提交的申请要等 60 秒
    revalidateTag(LINKS_TAG, { expire: 0 })
    return NextResponse.json({ code: 200, message: json?.message || "ok", data: json?.data ?? null })
}
