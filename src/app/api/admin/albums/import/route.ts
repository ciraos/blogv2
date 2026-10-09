import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { API_URL } from "@/lib/api";

// 相册管理 · 文件导入（JSON / ZIP）：POST /api/admin/albums/import → 远端 POST /albums/import
// （router.go:436-437，需管理员登录；⚠️ 会写相册表，实现后未在线上实测）。
//
// 不能走 adminProxyFetch：它检测到 body 就补 JSON Content-Type，会破坏 multipart boundary，
// 所以这里手动读 token + 直接透传 FormData（与 /api/admin/comments/import 同一做法）。
//
// 远端要求（pkg/handler/album/handler.go:505-601）：
//  - 表单字段 file（必填，handler.go:521-525）；
//  - 按**文件扩展名**分支（handler.go:562-575）：.json 直接解析（根对象 = 导出结构
//    { version, export_at, albums: [...], meta }，pkg/service/album/service.go:103-133），
//    .zip 取包内 albums.json（service.go:838-867），其它扩展名 → 400
//    「不支持的文件格式，仅支持 .json 和 .zip 文件」；
//  - 可选字段 skip_existing（默认 true）/ overwrite_existing（默认 false）/
//    default_category_id（handler.go:544-553）。注意后端用的是 DefaultPostForm，
//    字段缺失时两个 bool 都按默认值走，所以前端始终显式传值；
//  - 响应 { code, message, data: { total_count, success_count, skipped_count,
//    failed_count, created_ids, errors? } }（handler.go:583-600）。
//
// 后端没有体积硬限制（io.ReadAll 全量进内存，handler.go:536-541），
// 因此下面这个上限属于本地保护：宁可本地拦掉，也不放行一个可能打满后端内存的文件。
// 官方前端 AlbumImportDialog.tsx:131-135 用的也是同一个 50MB 口径。
const MAX_IMPORT_SIZE = 50 * 1024 * 1024;

// 缺失时的默认值，与远端 DefaultPostForm 一致（handler.go:544-545）
const DEFAULT_SKIP_EXISTING = "true";
const DEFAULT_OVERWRITE_EXISTING = "false";

/** 非负整数字符串（default_category_id） */
function isNonNegativeInt(value: string): boolean {
    return /^\d+$/.test(value);
}

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
        return NextResponse.json(
            { code: 400, message: "缺少 file 字段（相册数据文件）", data: null },
            { status: 400 }
        );
    }

    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith(".json") && !lowerName.endsWith(".zip")) {
        return NextResponse.json({ code: 400, message: "只支持 .json 或 .zip 文件", data: null }, { status: 400 });
    }

    if (file.size > MAX_IMPORT_SIZE) {
        return NextResponse.json({ code: 400, message: "文件大小不能超过 50MB", data: null }, { status: 400 });
    }

    // 选项校验：multipart 只能传字符串，两个 bool 只接受 true / false
    const rawSkipExisting = formData.get("skip_existing");
    const rawOverwriteExisting = formData.get("overwrite_existing");
    const rawDefaultCategoryId = formData.get("default_category_id");

    if (rawSkipExisting !== null && rawSkipExisting !== "true" && rawSkipExisting !== "false") {
        return NextResponse.json(
            { code: 400, message: "skip_existing 只能是 true 或 false", data: null },
            { status: 400 }
        );
    }
    if (rawOverwriteExisting !== null && rawOverwriteExisting !== "true" && rawOverwriteExisting !== "false") {
        return NextResponse.json(
            { code: 400, message: "overwrite_existing 只能是 true 或 false", data: null },
            { status: 400 }
        );
    }
    if (typeof rawDefaultCategoryId === "string" && rawDefaultCategoryId !== "" && !isNonNegativeInt(rawDefaultCategoryId)) {
        return NextResponse.json(
            { code: 400, message: "default_category_id 必须是非负整数", data: null },
            { status: 400 }
        );
    }

    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) {
        return NextResponse.json({ code: 401, message: "未登录", data: null }, { status: 401 });
    }

    // 只把校验过的字段重新组一遍往下传，不透传客户端可能塞进来的额外字段
    const forward = new FormData();
    forward.append("file", file);
    forward.append("skip_existing", rawSkipExisting === null ? DEFAULT_SKIP_EXISTING : String(rawSkipExisting));
    forward.append(
        "overwrite_existing",
        rawOverwriteExisting === null ? DEFAULT_OVERWRITE_EXISTING : String(rawOverwriteExisting)
    );
    if (typeof rawDefaultCategoryId === "string" && rawDefaultCategoryId !== "") {
        forward.append("default_category_id", rawDefaultCategoryId);
    }

    const headers = new Headers();
    headers.set("Authorization", `Bearer ${token}`);

    let res: Response;
    try {
        // 直接透传 FormData（fetch 会自动带上 multipart boundary）
        res = await fetch(`${API_URL}/albums/import`, {
            method: "POST",
            headers,
            body: forward,
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
            { code: res.status, message: text || `导入相册失败（HTTP ${res.status}）`, data: null },
            { status: res.ok ? 200 : res.status }
        );
    }

    return NextResponse.json(json, { status: res.ok ? 200 : res.status });
}
