import { publicProxy } from "@/lib/public-proxy"

// 同源代理：随机一篇友链朋友圈文章（友链页「鱼塘 · 换一篇」）。
// 后端不开放 CORS，浏览器端不能直连远端；返回结构 { code, message, data: RandomMomentPost }。
export async function GET() {
    return publicProxy("/pro/moments/randompost", { method: "GET" })
}
