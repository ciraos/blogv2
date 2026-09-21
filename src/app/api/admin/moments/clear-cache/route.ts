import { authedProxyFetch } from "@/lib/admin-api";

// 朋友圈管理 · 清理缓存（远端 POST /pro/admin/moments/clear-cache，需登录 + 管理员）
export async function POST() {
    return authedProxyFetch("/pro/admin/moments/clear-cache", { method: "POST" });
}
