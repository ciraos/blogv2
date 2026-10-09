import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { API_URL } from "@/lib/api";
import { ACCESS_TOKEN_KEY } from "@/lib/auth";

// 文章标签：POST /api/admin/article-tags → 远端 POST /post-tags（router.go:303，需管理员）。
//
// GET 列表仍走既有路由 src/app/api/admin/article-tags/route.ts（本次不改那个文件），
// 这里只补后台「分类标签管理」需要的写入口。
//
// 远端契约（pkg/handler/post_tag/handler.go:56-70）：
//   body = model.CreatePostTagRequest { name（必填）、slug? } → data = PostTagResponse（含 id / name / count）
const REMOTE = `${API_URL}/post-tags`;

export async function POST(request: NextRequest) {
    let raw: unknown;
    try {
        raw = await request.json();
    } catch {
        return NextResponse.json({ code: 400, message: "请求体格式错误（需 JSON）", data: null }, { status: 400 });
    }
    if (typeof raw !== "object" || raw === null) {
        return NextResponse.json({ code: 400, message: "请求体必须是 JSON 对象", data: null }, { status: 400 });
    }

    const name = (raw as { name?: unknown }).name;
    if (typeof name !== "string" || name.trim() === "") {
        return NextResponse.json({ code: 400, message: "标签名称不能为空", data: null }, { status: 400 });
    }

    const token = request.cookies.get(ACCESS_TOKEN_KEY)?.value;
    if (!token) {
        return NextResponse.json({ code: 401, message: "未登录", data: null }, { status: 401 });
    }

    let res: Response;
    try {
        res = await fetch(REMOTE, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify(raw),
            cache: "no-store",
        });
    } catch {
        return NextResponse.json({ code: 502, message: "无法连接后端服务", data: null }, { status: 502 });
    }

    const json: unknown = await res.json().catch(() => null);
    if (!res.ok || !json) {
        return NextResponse.json(
            {
                code: (json as { code?: number } | null)?.code ?? res.status,
                message: (json as { message?: string } | null)?.message || `创建标签失败（HTTP ${res.status}）`,
                data: null,
            },
            { status: res.status }
        );
    }
    return NextResponse.json(json, { status: 200 });
}
