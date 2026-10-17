import type { NextRequest } from "next/server"

import { publicProxy } from "@/lib/public-proxy"

// 同源代理：随机友链（页脚「随机友链」、友链鱼塘）。
// 后端不开放 CORS，浏览器端不能直连远端；返回结构与远端一致 { code, message, data: FriendLink[] }。
export async function GET(request: NextRequest) {
    const num = request.nextUrl.searchParams.get("num") ?? "3"
    return publicProxy("/public/links/random", { method: "GET", searchParams: new URLSearchParams({ num }) })
}
