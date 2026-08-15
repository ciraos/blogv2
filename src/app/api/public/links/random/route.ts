import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

// 同源代理：随机友链。
// 后端不开放 CORS，浏览器端（页脚随机友链刷新按钮）不能直连远端，
// 需经本路由转发。返回结构保持与远端一致：{ code, message, data: FriendLink[] }
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? ""

export async function GET(request: NextRequest) {
    const num = request.nextUrl.searchParams.get("num") ?? "3"
    try {
        const res = await fetch(`${API_URL}/public/links/random?num=${num}`, { cache: "no-store" })
        if (!res.ok) {
            return NextResponse.json({ code: res.status, message: "获取随机友链失败", data: [] })
        }
        const json = (await res.json()) as { code: number; message: string; data: unknown }
        return NextResponse.json({ code: 200, message: json.message ?? "ok", data: Array.isArray(json.data) ? json.data : [] })
    } catch {
        return NextResponse.json({ code: 500, message: "获取随机友链失败", data: [] })
    }
}
