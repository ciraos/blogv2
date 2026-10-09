import { adminProxyFetch } from "@/lib/admin-api";

// 知识库 · 重建（重嵌入）状态：GET /api/admin/knowledge/rebuild-status
// → 远端 GET /pro/admin/knowledge/rebuild-status（官方前端 knowledge.ts:27-29）
// 前端按 is_rebuilding 做 3s 轮询（官方 hook use-knowledge-page.ts:127-144 同款节奏）。
export async function GET() {
    return adminProxyFetch("/pro/admin/knowledge/rebuild-status", { method: "GET" });
}
