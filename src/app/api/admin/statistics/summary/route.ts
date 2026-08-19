import { adminProxyFetch } from "@/lib/admin-api";

/** GET /api/admin/statistics/summary 统计概览（基础统计 + 访客分析 + 热门页面 + 趋势） */
export async function GET() {
    return adminProxyFetch("/statistics/summary", { method: "GET" });
}
