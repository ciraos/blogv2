import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

import { API_URL } from "@/lib/api";
import { ACCESS_TOKEN_KEY } from "@/lib/auth";

// 文件管理 · 下载：GET /api/admin/file/download/[id] → 远端 GET /file/download/:id
// 与其它代理不同：这里要**透传二进制流**（不是 JSON），所以不走 authedProxyFetch。
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const token = (await cookies()).get(ACCESS_TOKEN_KEY)?.value;
    if (!token) {
        return Response.json({ code: 401, message: "未登录", data: null }, { status: 401 });
    }

    let res: Response;
    try {
        res = await fetch(`${API_URL}/file/download/${encodeURIComponent(id)}`, {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
        });
    } catch {
        return Response.json({ code: 502, message: "无法连接后端服务", data: null }, { status: 502 });
    }

    if (!res.ok || !res.body) {
        return Response.json({ code: res.status, message: `下载失败（HTTP ${res.status}）`, data: null }, { status: res.status });
    }

    // 只透传下载相关的响应头（内容类型 / 长度 / 附件名）
    const headers = new Headers();
    for (const key of ["content-type", "content-length", "content-disposition"]) {
        const value = res.headers.get(key);
        if (value) headers.set(key, value);
    }
    return new Response(res.body, { status: 200, headers });
}
