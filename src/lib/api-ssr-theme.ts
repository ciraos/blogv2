"use client";

/**
 * SSR 主题（Next.js standalone）的浏览器端 API。
 *
 * 与标准主题的区别（见 src/app/api/admin/ssr-theme/* 的注释）：
 *  · 标准主题：ZIP 上传（multipart）→ Go 直出静态文件；
 *  · SSR 主题：只给 downloadUrl（JSON）→ 后端下载 tar.gz → `node server.js` 起进程。
 *
 * 远端响应形状（pkg/ssr/manager.go ThemeInfo + pkg/handler/ssrtheme/handler.go）：
 *   list   → data: SsrTheme[]            （数组，不是 { list, total }）
 *   status → data: SsrTheme
 *   写操作 → data: null，message 为结果文案
 */

import { request } from "@/lib/api";

export type SsrThemeStatus = "not_installed" | "installed" | "running" | "error" | string;

export interface SsrTheme {
    name: string;
    version?: string;
    status?: SsrThemeStatus;
    /** 运行端口（status=running 时才有） */
    port?: number;
    installedAt?: string;
    startedAt?: string;
    /** 来自数据库的「当前启用」标记 */
    is_current?: boolean;
}

/** GET /api/admin/ssr-theme/list */
export function getSsrThemesApi(): Promise<SsrTheme[]> {
    return request<SsrTheme[]>("/api/admin/ssr-theme/list", { method: "GET" });
}

/** GET /api/admin/ssr-theme/{name}/status */
export function getSsrThemeStatusApi(name: string): Promise<SsrTheme> {
    return request<SsrTheme>(`/api/admin/ssr-theme/${encodeURIComponent(name)}/status`, { method: "GET" });
}

/** POST /api/admin/ssr-theme/install */
export function installSsrThemeApi(input: {
    themeName: string;
    version?: string;
    downloadUrl: string;
}): Promise<unknown> {
    return request("/api/admin/ssr-theme/install", {
        method: "POST",
        body: JSON.stringify(input),
    });
}

/** POST /api/admin/ssr-theme/{name}/start */
export function startSsrThemeApi(name: string): Promise<unknown> {
    return request(`/api/admin/ssr-theme/${encodeURIComponent(name)}/start`, { method: "POST" });
}

/** POST /api/admin/ssr-theme/{name}/stop */
export function stopSsrThemeApi(name: string): Promise<unknown> {
    return request(`/api/admin/ssr-theme/${encodeURIComponent(name)}/stop`, { method: "POST" });
}

/** DELETE /api/admin/ssr-theme/{name} */
export function uninstallSsrThemeApi(name: string): Promise<unknown> {
    return request(`/api/admin/ssr-theme/${encodeURIComponent(name)}`, { method: "DELETE" });
}
