import { authedProxyFetch } from "@/lib/admin-api";

// 朋友圈管理 · 抓取状态（远端 /pro/admin/moments/fetch-status，需登录 + 管理员）
// 该路径是固定段，优先于同级 [id] 动态段匹配。
export async function GET() {
    return authedProxyFetch("/pro/admin/moments/fetch-status", { method: "GET" });
}
