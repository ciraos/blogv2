import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { API_URL } from "@/lib/api";
import { ACCESS_TOKEN_KEY } from "@/lib/auth";

// 上传主题压缩包：POST /api/theme/upload（需 JWTAuth）→ 远端 /theme/upload（multipart/form-data）。
//
// 契约（源码证据，非猜测）：
//  - internal/infra/router/router.go:770 注册 POST /theme/upload（JWTAuth）。
//  - pkg/handler/theme/handler.go:461-514 UploadTheme：
//      · c.FormFile("file")                → 字段名固定为 file（:474）
//      · Content-Type 必须是 application/zip 或文件名以 .zip 结尾（:481-485）
//      · 文件 ≤ 50MB（:488-492）
//      · c.PostForm("force_update") == "true" 时为强制更新（:495）
//      · 服务层 UploadTheme(ctx, userID, file, forceUpdate) 会解析 theme.json 并**直接安装**（:498）
//      · 成功 data 为 ThemeUploadResponse（handler.go:59-64 / 505-510）：
//            { theme_name, theme_info, installed: true, message }
//  - 官方前端同款流程（只读对照 src/lib/api/theme-mall.ts:72-82）：FormData 里 append("file", file)，
//    forceUpdate 时再 append("force_update", "true")。
//
// ⚠️ 为什么不用 adminProxyFetch：它在有 body 且没带 Content-Type 时会补 application/json，
// 会破坏 multipart 的 boundary。这里手动读 httpOnly token + 直接透传 FormData，
// 与 /api/admin/config/import（import 路由的 route.ts 第 44-55 行）、/api/user/avatar 同一做法。
const MAX_THEME_ZIP_SIZE = 50 * 1024 * 1024; // 与后端 handler.go:488 的 50MB 对齐

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
        return NextResponse.json({ code: 400, message: "缺少 file 字段（主题压缩包）", data: null }, { status: 400 });
    }
    // 后端两个条件取「或」：Content-Type 为 application/zip 或文件名 .zip 结尾。
    // 浏览器给的 Content-Type 常常是 application/x-zip-compressed，所以只按扩展名拦，避免误杀。
    if (!file.name.toLowerCase().endsWith(".zip")) {
        return NextResponse.json({ code: 400, message: "仅支持 ZIP 格式的主题压缩包", data: null }, { status: 400 });
    }
    if (file.size > MAX_THEME_ZIP_SIZE) {
        return NextResponse.json({ code: 400, message: "文件大小不能超过 50MB", data: null }, { status: 400 });
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
        // 直接透传 FormData（fetch 会自动带上 multipart boundary 与 force_update 字段）
        res = await fetch(`${API_URL}/theme/upload`, {
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
        // 非 JSON 响应（例如网关错误页）
    }

    if (!json) {
        return NextResponse.json(
            { code: res.status, message: text || `上传主题失败（HTTP ${res.status}）`, data: null },
            { status: res.ok ? 200 : res.status }
        );
    }

    return NextResponse.json(json, { status: res.ok ? 200 : res.status });
}
