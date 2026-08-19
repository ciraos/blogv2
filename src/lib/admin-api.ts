// 管理员接口同源代理：读取 httpOnly token cookie，转发到远端 /admin/* 接口。
// 后端不开放 CORS，浏览器端管理页面的所有 /admin/* 请求都走这里的 /api/admin/* 路由。
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { API_URL } from "./api";

/**
 * 转发一个管理员请求到远端（自动带上 token）。
 * @param path 远端路径，如 /admin/users
 * @param init fetch 参数（method/body/headers）
 */
export async function adminProxyFetch(path: string, init?: RequestInit): Promise<NextResponse> {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) {
        return NextResponse.json({ code: 401, message: "未登录", data: null }, { status: 401 });
    }

    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${token}`);
    if (init?.body && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
    }

    let res: Response;
    try {
        res = await fetch(`${API_URL}${path}`, { ...init, headers, cache: "no-store" });
    } catch {
        return NextResponse.json({ code: 502, message: "无法连接后端服务", data: null }, { status: 502 });
    }

    const text = await res.text();
    let json: unknown = null;
    try {
        json = JSON.parse(text);
    } catch {
        // 非 JSON 响应
    }
    return NextResponse.json(
        json ?? { code: res.status, message: text || `请求失败（HTTP ${res.status}）`, data: null },
        { status: res.ok ? 200 : res.status }
    );
}
