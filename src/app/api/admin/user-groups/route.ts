import { adminProxyFetch } from "@/lib/admin-api";

/** GET /api/admin/user-groups 获取用户组列表（下拉用） */
export async function GET() {
    return adminProxyFetch("/admin/user-groups", { method: "GET" });
}
