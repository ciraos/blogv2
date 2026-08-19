import { NextRequest, NextResponse } from "next/server";

import { adminProxyFetch } from "@/lib/admin-api";

/** GET /api/admin/users 管理员分页查询用户列表（支持 keyword/status/groupID/page/pageSize） */
export async function GET(request: NextRequest) {
    const { searchParams } = request.nextUrl;
    // 只转发已知参数，避免把无关参数带到后端
    const allowed = ["page", "pageSize", "keyword", "groupID", "status"];
    const qs = new URLSearchParams();
    for (const key of allowed) {
        const value = searchParams.get(key);
        if (value !== null && value !== "") {
            qs.set(key, value);
        }
    }
    const query = qs.toString();
    return adminProxyFetch(`/admin/users${query ? `?${query}` : ""}`, { method: "GET" });
}

/** POST /api/admin/users 管理员创建用户 */
export async function POST(request: NextRequest) {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ code: 400, message: "请求体格式错误", data: null }, { status: 400 });
    }
    return adminProxyFetch("/admin/users", {
        method: "POST",
        body: JSON.stringify(body),
    });
}
