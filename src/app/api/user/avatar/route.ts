import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { API_URL } from "@/lib/api";

// 用户中心 · 上传头像：POST /api/user/avatar（multipart）→ 远端 /user/avatar。
// 返回 { code, message, data: { url } }。
// 不能走 authedProxyFetch（它会补 JSON Content-Type，破坏 multipart boundary），
// 这里手动读 token 并直接透传 FormData。
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
        // 直接透传 FormData（fetch 自动设置 multipart boundary）
        res = await fetch(`${API_URL}/user/avatar`, {
            method: "POST",
            headers,
            body: formData,
            cache: "no-store",
        });
    } catch {
        return NextResponse.json({ code: 502, message: "无法连接后端服务", data: null }, { status: 502 });
    }

    const json: unknown = await res.json().catch(() => null);

    if (!res.ok || !json) {
        return NextResponse.json(
            {
                code: (json as { code?: number })?.code ?? res.status,
                message: (json as { message?: string })?.message || `头像上传失败（HTTP ${res.status}）`,
                data: null,
            },
            { status: res.status }
        );
    }

    return NextResponse.json(json);
}
