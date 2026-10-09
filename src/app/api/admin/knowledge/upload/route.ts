import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { API_URL } from "@/lib/api";
import { cookies } from "next/headers";

// 知识库 · 上传文档：POST /api/admin/knowledge/upload（multipart）→ 远端 POST /pro/admin/knowledge/upload。
// 不能走 adminProxyFetch：那个助手在 body 存在时会补 JSON Content-Type，破坏 multipart boundary
// （src/lib/admin-api.ts 顶部注释明确要求这种场景直接 fetch 透传，写法照 src/app/api/user/avatar/route.ts）。
// 远端路径证据：官方前端快照 src/lib/api/knowledge.ts:59-65（formData.append("file", file)）。
export async function POST(request: NextRequest) {
    let formData: FormData;
    try {
        formData = await request.formData();
    } catch {
        return NextResponse.json(
            { code: 400, message: "请求体格式错误（需 multipart/form-data）", data: null },
            { status: 400 }
        );
    }

    if (!formData.get("file")) {
        return NextResponse.json({ code: 400, message: "缺少 file 字段", data: null }, { status: 400 });
    }

    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) {
        return NextResponse.json({ code: 401, message: "未登录", data: null }, { status: 401 });
    }

    const headers = new Headers();
    headers.set("Authorization", `Bearer ${token}`);

    let res: Response;
    try {
        // 直接透传 FormData（fetch 自动带 boundary）
        res = await fetch(`${API_URL}/pro/admin/knowledge/upload`, {
            method: "POST",
            headers,
            body: formData,
            cache: "no-store",
        });
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
        json ?? { code: res.status, message: text || `上传失败（HTTP ${res.status}）`, data: null },
        { status: res.ok ? 200 : res.status }
    );
}
