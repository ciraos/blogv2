import { authedProxyFetch } from "@/lib/admin-api";

// 页面管理 · 初始化默认页面：POST /api/admin/pages/initialize → 远端 POST /pages/initialize
// 会补齐 /privacy、/cookies、/copyright 等默认页面（已存在的会被跳过/兼容迁移，不会覆盖内容）。
export async function POST() {
    return authedProxyFetch("/pages/initialize", { method: "POST" });
}
