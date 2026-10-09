import { adminProxyFetch } from "@/lib/admin-api";

// 知识库 · 清空：DELETE /api/admin/knowledge/clear → 远端 DELETE /pro/admin/knowledge/clear
// （官方前端 knowledge.ts:51-53；返回 { documents_deleted, chunks_deleted, vectors_cleared }）
export async function DELETE() {
    return adminProxyFetch("/pro/admin/knowledge/clear", { method: "DELETE" });
}
