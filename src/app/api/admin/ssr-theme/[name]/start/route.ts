import type { NextRequest } from "next/server";

import { adminProxyFetch } from "@/lib/admin-api";

/**
 * SSR 主题 · 启动（管理员）。
 *
 * 远端：`POST /admin/ssr-theme/{name}/start`，body `{ port?: number }`。
 *
 * 关于端口：后端 `StartThemeRequest.Port` 为 0 时**固定用 3000**
 * （pkg/handler/ssrtheme/handler.go:140）。而 3000 经常被别的前台容器占用，
 * 子进程会以 `EADDRINUSE` 退出、接口却已经回了「启动成功」。
 * 所以这里允许前端指定端口：body 里带了 port 就原样转发，没带就交给后端默认。
 */
export async function POST(request: NextRequest, context: { params: Promise<{ name: string }> }) {
    const { name } = await context.params;

    let port: number | undefined;
    try {
        const body = (await request.json()) as { port?: unknown };
        const raw = Number(body?.port);
        if (Number.isInteger(raw) && raw > 0 && raw < 65536) port = raw;
    } catch {
        // 没 body 或不是 JSON：走后端默认端口
    }

    return adminProxyFetch(`/admin/ssr-theme/${encodeURIComponent(name)}/start`, {
        method: "POST",
        ...(port ? { body: JSON.stringify({ port }) } : {}),
    });
}
