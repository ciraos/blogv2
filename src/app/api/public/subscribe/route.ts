import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

import { API_URL } from "@/lib/api"

// 订阅代理：POST 订阅 / DELETE 退订，转发到远端 /public/subscribe。
// 后端不开放 CORS，浏览器端（订阅弹窗）需经本路由转发。
const REMOTE = `${API_URL}/public/subscribe`

async function forward(request: NextRequest, method: "POST" | "DELETE") {
    let body: unknown
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ code: 400, message: "请求体格式错误", data: null }, { status: 400 })
    }

    let res: Response
    try {
        res = await fetch(REMOTE, {
            method,
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
    return NextResponse.json({ code: 200, message: json?.message || "ok", data: json?.data ?? null })
}

export async function POST(request: NextRequest) {
    return forward(request, "POST")
}

export async function DELETE(request: NextRequest) {
    return forward(request, "DELETE")
}
