import { NextResponse } from "next/server";

import { API_URL } from "@/lib/api";

/**
 * 「公开（无需登录）」接口的同源转发 helper。
 *
 * 与 lib/admin-api.ts 的 authedProxyFetch 的区别：**不读 cookie、不拼 Bearer**。
 * 用于登录/注册/激活/找回密码、以及公开评论点赞这类匿名可调用的接口 ——
 * 后端不开放 CORS，浏览器端必须经本站转发，但这些接口不需要登录态。
 *
 * 响应统一成 { code, message, data } 信封：远端返回什么 code 就透什么，
 * 网络不通统一 502（与登录路由一致的口径）。
 */
export async function publicProxy(
    path: string,
    init: { method: "GET" | "POST"; body?: unknown; searchParams?: URLSearchParams } = { method: "GET" }
): Promise<NextResponse> {
    const qs = init.searchParams?.toString();
    const url = `${API_URL}${path}${qs ? `?${qs}` : ""}`;

    const headers: Record<string, string> = {};
    if (init.body !== undefined) headers["Content-Type"] = "application/json";

    let res: Response;
    try {
        res = await fetch(url, {
            method: init.method,
            headers,
            body: init.body === undefined ? undefined : JSON.stringify(init.body),
            cache: "no-store",
        });
    } catch {
        return NextResponse.json({ code: 502, message: "无法连接后端服务", data: null }, { status: 502 });
    }

    const json = await res.json().catch(() => null);
    if (!res.ok) {
        return NextResponse.json(
            { code: json?.code ?? res.status, message: json?.message || `请求失败（HTTP ${res.status}）`, data: null },
            { status: res.status }
        );
    }
    return NextResponse.json({ code: json?.code ?? 200, message: json?.message || "ok", data: json?.data ?? null });
}
