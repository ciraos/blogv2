import { authedProxyFetch } from "@/lib/admin-api";

// 朋友圈管理 · 触发 RSS 抓取（远端 POST /pro/admin/moments/fetch，需登录 + 管理员）
// 后端为异步任务：触发后需轮询 /api/admin/moments/fetch-status。
export async function POST() {
    return authedProxyFetch("/pro/admin/moments/fetch", { method: "POST" });
}
