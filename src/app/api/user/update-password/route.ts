import { NextRequest, NextResponse } from "next/server";

import { authedProxyFetch } from "@/lib/admin-api";

// 用户中心 · 修改密码：POST /api/user/update-password → 远端 /user/update-password
export async function POST(request: NextRequest) {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ code: 400, message: "请求体格式错误", data: null }, { status: 400 });
    }
    return authedProxyFetch("/user/update-password", { method: "POST", body: JSON.stringify(body) });
}
