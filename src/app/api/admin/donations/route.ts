import { NextRequest, NextResponse } from "next/server";
import { adminProxyFetch } from "@/lib/admin-api";

// 管理员打赏列表：GET 转发到远端 /pro/admin/donations（需登录）。
// 后端不开放 CORS 且需鉴权，浏览器端不能直连，由本路由读取 httpOnly cookie 中的 token 转发。
// 查询参数（page / page_size 等）原样透传。
export async function GET(request: NextRequest) {
    const qs = request.nextUrl.searchParams.toString();
    return adminProxyFetch(`/pro/admin/donations${qs ? `?${qs}` : ""}`, { method: "GET" });
}

/** POST /api/admin/donations 管理员新增打赏记录（转发远端 /pro/admin/donations） */
export async function POST(request: NextRequest) {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ code: 400, message: "请求体格式错误", data: null }, { status: 400 });
    }
    return adminProxyFetch("/pro/admin/donations", { method: "POST", body: JSON.stringify(body) });
}
