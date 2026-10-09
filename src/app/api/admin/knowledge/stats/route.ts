import { adminProxyFetch } from "@/lib/admin-api";

// 知识库 · 总览统计：GET /api/admin/knowledge/stats → 远端 GET /pro/admin/knowledge/stats
// （官方前端 knowledge.ts:19-21；线上未登录探活 401 = 路由存在）
export async function GET() {
    return adminProxyFetch("/pro/admin/knowledge/stats", { method: "GET" });
}
