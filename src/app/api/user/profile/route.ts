import { NextRequest, NextResponse } from "next/server";

import { authedProxyFetch } from "@/lib/admin-api";

// 用户中心 · 更新资料：PUT /api/user/profile → 远端 /user/profile（更新昵称、网站）
export async function PUT(request: NextRequest) {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ code: 400, message: "请求体格式错误", data: null }, { status: 400 });
    }
    return authedProxyFetch("/user/profile", { method: "PUT", body: JSON.stringify(body) });
}
