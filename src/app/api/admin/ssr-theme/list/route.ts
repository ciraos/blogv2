import { adminProxyFetch } from "@/lib/admin-api";

/**
 * SSR 主题 · 已安装列表（管理员）。
 *
 * 远端：`GET /admin/ssr-theme/list`
 * 响应 data 是数组（后端直接返回 slice，不是 { list, total }）：
 *   [{ name, version, status: "not_installed"|"installed"|"running"|"error",
 *     port?, installedAt?, startedAt?, is_current }]
 */
export async function GET() {
    return adminProxyFetch("/admin/ssr-theme/list", { method: "GET" });
}
