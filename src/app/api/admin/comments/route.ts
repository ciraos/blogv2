import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";

import { adminProxyFetch } from "@/lib/admin-api";
import { COMMENTS_TAG } from "@/lib/api";

// 管理端评论列表 / 批量删除：转发到远端 /comments（需管理员 token）。
// 后端不开放 CORS 且需鉴权，浏览器端不能直连，由本路由读取 httpOnly cookie 中的 token 转发。
// GET 查询参数（page / pageSize / nickname / email / content / target_path / ip_address / status）原样透传。
export async function GET(request: NextRequest) {
    const qs = request.nextUrl.searchParams.toString();
    return adminProxyFetch(`/comments${qs ? `?${qs}` : ""}`, { method: "GET" });
}

/** DELETE /api/admin/comments 批量删除评论（请求体 { ids: string[] }，转发远端 DELETE /comments） */
export async function DELETE(request: NextRequest) {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ code: 400, message: "请求体格式错误", data: null }, { status: 400 });
    }
    const res = await adminProxyFetch("/comments", { method: "DELETE", body: JSON.stringify(body) });
    // 删了评论 → 前台评论列表与「最近评论」缓存立刻失效
    if (res.ok) revalidateTag(COMMENTS_TAG, { expire: 0 });
    return res;
}
