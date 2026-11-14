import type { NextRequest } from "next/server";

import { adminProxyFetch } from "@/lib/admin-api";

/**
 * SSR 主题 · 停止（管理员）。
 *
 * 远端：`POST /admin/ssr-theme/{name}/stop`
 */
export async function POST(_request: NextRequest, context: { params: Promise<{ name: string }> }) {
    const { name } = await context.params;
    return adminProxyFetch(`/admin/ssr-theme/${encodeURIComponent(name)}/stop`, { method: "POST" });
}
