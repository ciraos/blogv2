// 需要登录的接口同源代理：读取 httpOnly token cookie，带上 Bearer 转发到远端。
// 后端不开放 CORS，浏览器端的管理端（/admin/*）与用户中心（/user/*）请求都走同源路由转发。
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { API_URL } from "./api";

/**
 * 转发一个需要登录的请求到远端（自动带上 token）。
 * 注意：body 为 FormData 时不要用它（这里会补 JSON Content-Type，破坏 multipart boundary），
 * 那种情况直接用 fetch 透传（见 /api/user/avatar、/api/public/comments/upload）。
 * @param path 远端路径，如 /admin/users
 * @param init fetch 参数（method/body/headers）
 */
export async function authedProxyFetch(path: string, init?: RequestInit): Promise<NextResponse> {
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

/** 管理端路由沿用的旧名字（实现与 authedProxyFetch 完全相同） */
export const adminProxyFetch = authedProxyFetch;

/** 取 cookie 里的登录 token；没有则返回 null（未登录） */
export async function adminToken(): Promise<string | null> {
    const cookieStore = await cookies();
    return cookieStore.get("token")?.value ?? null;
}

/**
 * 取远端响应原始流（不解析 JSON、不包裹成我们的 { code, message, data } 信封）。
 *
 * 用途：个别接口的响应本身是 HTTP 重定向 / 非 JSON 体，必须原样回给浏览器，
 * 例如存储策略的 OneDrive 授权 `GET /api/policies/connect/onedrive/:id`
 * （社区版 handler 可能 302 到微软授权页，也可能返回 JSON `{ data: { url } }`）。
 *
 * 返回 null 表示未登录（调用方自行回 401；这里不直接返回 NextResponse，
 * 是为了让调用方能按需选择 401 文案 / 状态）。网络异常由调用方 catch。
 */
export async function rawAdminProxyFetch(path: string, init?: RequestInit): Promise<Response | null> {
    const token = await adminToken();
    if (!token) return null;

    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${token}`);
    if (init?.body && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
    }

    // redirect: "manual" —— 授权链接是 302 时不要把重定向跟到最后，
    // 原样把 302 + Location 交给浏览器（浏览器才会跳到微软授权页）。
    return fetch(`${API_URL}${path}`, { ...init, headers, cache: "no-store", redirect: "manual" });
}
