import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

import { API_URL } from "@/lib/api"

// 搜索代理：GET 转发到远端 /search。
// 后端不开放 CORS，浏览器端（搜索对话框）需经本路由转发。
// 注意：API_URL 已含 /api 前缀，这里不能再拼 /api。
const REMOTE = `${API_URL}/search`

export async function GET(request: NextRequest) {
    const q = request.nextUrl.searchParams.get("q")?.trim() ?? ""
    const page = request.nextUrl.searchParams.get("page") ?? "1"
    const size = request.nextUrl.searchParams.get("size") ?? "10"
    if (!q) {
        return NextResponse.json({ code: 400, message: "搜索关键词不能为空", data: null }, { status: 400 })
    }

    const remoteUrl = `${REMOTE}?q=${encodeURIComponent(q)}&page=${encodeURIComponent(page)}&size=${encodeURIComponent(size)}`
    let res: Response
    try {
        res = await fetch(remoteUrl, { cache: "no-store" })
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
