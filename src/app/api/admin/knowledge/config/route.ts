import { adminProxyFetch } from "@/lib/admin-api";

// 知识库 · 运行配置：GET /api/admin/knowledge/config → 远端 GET /pro/admin/knowledge/config
// （官方前端 knowledge.ts:23-25；返回 enabled / embedding_provider / embedding_model /
//   vector_store / vector_dimension）
export async function GET() {
    return adminProxyFetch("/pro/admin/knowledge/config", { method: "GET" });
}
