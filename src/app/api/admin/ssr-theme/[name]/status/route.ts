import type { NextRequest } from "next/server";

import { adminProxyFetch } from "@/lib/admin-api";

/**
 * SSR 主题 · 运行状态（管理员）。
 *
 * 远端：`GET /admin/ssr-theme/{name}/status`
 * data：{ name, version, status, port?, installedAt?, startedAt? }
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ name: string }> }) {
    const { name } = await context.params;
    return adminProxyFetch(`/admin/ssr-theme/${encodeURIComponent(name)}/status`, { method: "GET" });
}
