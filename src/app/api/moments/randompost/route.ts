import { NextResponse } from "next/server"

// 同源代理：随机一篇友链朋友圈文章（友链鱼塘）。
// 后端不开放 CORS，浏览器端（友链页鱼塘「换一篇」按钮）不能直连远端，
// 需经本路由转发。返回结构保持与远端一致：{ code, message, data: RandomMomentPost }
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? ""

export async function GET() {
    try {
        const res = await fetch(`${API_URL}/pro/moments/randompost`, { cache: "no-store" })
        if (!res.ok) {
            return NextResponse.json({ code: res.status, message: "获取随机文章失败", data: null })
        }
        const json = (await res.json()) as { code: number; message: string; data: unknown }
        const data = json?.data && typeof json.data === "object" ? json.data : null
        return NextResponse.json({ code: json.code ?? 200, message: json.message ?? "ok", data })
    } catch {
        return NextResponse.json({ code: 500, message: "获取随机文章失败", data: null })
    }
}
