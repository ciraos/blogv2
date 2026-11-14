import type { NextRequest } from "next/server";

import { adminProxyFetch } from "@/lib/admin-api";

/**
 * SSR 主题 · 启动（管理员）。
 *
 * 远端：`POST /admin/ssr-theme/{name}/start`
 * 后端会 `node server.js` 起子进程（端口从 3000 起顺延），返回 data 为 null，message 是结果。
 */
export async function POST(_request: NextRequest, context: { params: Promise<{ name: string }> }) {
    const { name } = await context.params;
    return adminProxyFetch(`/admin/ssr-theme/${encodeURIComponent(name)}/start`, { method: "POST" });
}
