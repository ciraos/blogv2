import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

import { publicProxy } from "@/lib/public-proxy"

// 搜索代理：GET 转发到远端 /search（**没有** /public 前缀，线上实测：/public/search 返回 404）。
// 后端不开放 CORS，浏览器端（搜索对话框）需经本路由转发；API_URL 已含 /api，这里不再拼。
export async function GET(request: NextRequest) {
    const q = request.nextUrl.searchParams.get("q")?.trim() ?? ""
    if (!q) {
        return NextResponse.json({ code: 400, message: "搜索关键词不能为空", data: null }, { status: 400 })
    }

    const searchParams = new URLSearchParams({
        q,
        page: request.nextUrl.searchParams.get("page") ?? "1",
        size: request.nextUrl.searchParams.get("size") ?? "10",
    })
    return publicProxy("/search", { method: "GET", searchParams })
}
