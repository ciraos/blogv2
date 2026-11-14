import type { NextRequest } from "next/server";

import { adminProxyFetch } from "@/lib/admin-api";

/**
 * SSR 主题 · 卸载（管理员）。
 *
 * 远端：`DELETE /admin/ssr-theme/{name}`
 *
 * 后端会顺手停掉进程（Uninstall 内部先 Stop 再删目录），所以前端不需要先 STOP 再删。
 * 注意：后端拒绝卸载「当前启用」的 SSR 主题，需要先切回标准主题。
 */
export async function DELETE(_request: NextRequest, context: { params: Promise<{ name: string }> }) {
    const { name } = await context.params;
    return adminProxyFetch(`/admin/ssr-theme/${encodeURIComponent(name)}`, { method: "DELETE" });
}
