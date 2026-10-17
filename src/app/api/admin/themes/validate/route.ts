import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { API_URL } from "@/lib/api";
import { ACCESS_TOKEN_KEY } from "@/lib/auth";

// 校验主题压缩包：POST /api/theme/validate（需 JWTAuth）→ 远端 /theme/validate（multipart/form-data）。
//
// 契约（源码证据，非猜测）：
//  - internal/infra/router/router.go:773 注册 POST /theme/validate（JWTAuth）。
//  - pkg/handler/theme/handler.go:528-556 ValidateTheme：c.FormFile("file")（字段名 file，:541）；
//    **没有** 50MB / 扩展名的本地判断，全部交给服务层 ValidateThemePackage（:548）。
//  - 返回 data 为 ThemeValidationResult（pkg/service/theme/service.go:205-214）：
//        { is_valid, errors: string[], warnings: string[],
//          metadata: ThemeMetadata|null, file_list: string[], total_size: number,
//          existing_theme?: ThemeInfo }
//    existing_theme 表示「同名主题已安装」（官方前端据此做版本比较，见只读对照
//    src/app/admin/themes/_hooks/use-theme-page.ts:368-387）。
//  - 官方前端流程（theme-mall.ts:84-92 → use-theme-page.ts:355-396）：先 validate，
//    is_valid 才 upload；同名且版本不低时带 force_update=true 再上传。
//
// ⚠️ 同 upload：multipart 不能用 adminProxyFetch（会补 JSON Content-Type 破坏 boundary），
// 这里手动读 httpOnly token + 透传 FormData。
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

    const cookieStore = await cookies();
    const token = cookieStore.get(ACCESS_TOKEN_KEY)?.value;
    if (!token) {
        return NextResponse.json({ code: 401, message: "未登录", data: null }, { status: 401 });
    }

    const headers = new Headers();
    headers.set("Authorization", `Bearer ${token}`);

    let res: Response;
    try {
        res = await fetch(`${API_URL}/theme/validate`, {
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
            { code: res.status, message: text || `校验主题失败（HTTP ${res.status}）`, data: null },
            { status: res.ok ? 200 : res.status }
        );
    }

    return NextResponse.json(json, { status: res.ok ? 200 : res.status });
}
