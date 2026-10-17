import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { API_URL } from "@/lib/api";
import { ACCESS_TOKEN_KEY } from "@/lib/auth";

// 导入配置数据（⚠️ 高危，会写库）：POST /api/admin/config/import（multipart）→ 远端
// /config/import（router.go:902，需管理员登录）。
//
// 不能走 adminProxyFetch：它检测到 body 就补 JSON Content-Type，会破坏 multipart boundary，
// 所以这里手动读 token + 直接透传 FormData（与 /api/user/avatar 同一做法）。
// 远端要求（import_export_handler.go:79-94）：字段名 file、文件名必须以 .json 结尾、≤10MB；
// 这三条本地先拦一遍，省掉必然失败的往返（最终仍以远端校验为准）。
const MAX_IMPORT_SIZE = 10 * 1024 * 1024;

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

    const file = formData.get("file");
    if (!(file instanceof File)) {
        return NextResponse.json({ code: 400, message: "缺少 file 字段（配置文件）", data: null }, { status: 400 });
    }
    if (!file.name.toLowerCase().endsWith(".json")) {
        return NextResponse.json({ code: 400, message: "配置文件必须是 .json 格式", data: null }, { status: 400 });
    }
    if (file.size > MAX_IMPORT_SIZE) {
        return NextResponse.json({ code: 400, message: "配置文件大小不能超过 10MB", data: null }, { status: 400 });
    }

    const cookieStore = await cookies();
    const token = cookieStore.get(ACCESS_TOKEN_KEY)?.value;
    if (!token) {
        return NextResponse.json({ code: 401, message: "未登录", data: null }, { status: 401 });
    }

    const headers = new Headers();
    headers.set("Authorization", `Bearer ${token}`);

    let res: Response;
    try {
        // 直接透传 FormData（fetch 会自动带上 multipart boundary）
        res = await fetch(`${API_URL}/config/import`, {
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

    if (!json) {
        return NextResponse.json(
            { code: res.status, message: text || `导入配置失败（HTTP ${res.status}）`, data: null },
            { status: res.ok ? 200 : res.status }
        );
    }

    return NextResponse.json(json, { status: res.ok ? 200 : res.status });
}
