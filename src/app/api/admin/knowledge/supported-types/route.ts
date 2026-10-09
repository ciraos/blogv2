import { adminProxyFetch } from "@/lib/admin-api";

// 知识库 · 支持的文件类型：GET /api/admin/knowledge/supported-types
// → 远端 GET /pro/admin/knowledge/supported-types（官方前端 knowledge.ts:67-69）
// 返回 { types: string[] }，前端拿来拼 <input type="file" accept>。
export async function GET() {
    return adminProxyFetch("/pro/admin/knowledge/supported-types", { method: "GET" });
}
