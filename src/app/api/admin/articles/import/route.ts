import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { API_URL } from "@/lib/api";

// 文章导入：POST /api/admin/articles/import → 远端 POST /articles/import（multipart/form-data）。
//
// ⚠️ 高危：导入会**批量写文章表**（必要时还会连带创建分类 / 标签），所以：
//   1) 前端弹窗有明确的后果提示 + 二次确认；
//   2) 本代理只放行白名单字段，多余字段不转发；
//   3) 非法请求本地就 400，不做必然失败的往返。
//
// 远端契约（router.go:377 → pkg/handler/article/handler.go:869-955）：
//   表单字段 file（必填，multipart 文件）、create_categories / create_tags / skip_existing
//   （字符串 "true" / "false"，默认 true）、default_status（默认 "DRAFT"）；
//   文件名扩展名只认 .json 与 .zip（handler.go:933-943，其它一律 400「不支持的文件格式」）；
//   .zip 内部必须是根目录下的 articles.json（service/article/import_export_service.go:466+）；
//   返回 data = article.ImportResult { total_count, success_count, skipped_count, failed_count, errors, created_ids }。
//
// 不能走 adminProxyFetch：它见到 body 就补 JSON Content-Type，会破坏 multipart boundary。
// 做法与 /api/admin/config/import 一致：手动读 token + 直接透传 FormData。

/**
 * 本地体积上限（100MB）。
 * 后端没有为这个接口写显式的 size 校验（只有 config/import 的 10MB、theme 的 50MB），
 * 这里设 100MB 只是挡住明显异常的请求，属于本地保守值，最终仍以远端为准。
 */
const MAX_IMPORT_SIZE = 100 * 1024 * 1024;

/** 允许的扩展名（与远端 switch 一致，仅 .json / .zip） */
const ALLOWED_EXTENSIONS = [".json", ".zip"];

/** 远端 default_status 的合法枚举（model 层枚举，未知值会退化成 DRAFT，这里只做白名单收窄） */
const ALLOWED_STATUS = ["DRAFT", "PUBLISHED", "ARCHIVED", "SCHEDULED"];

const BOOLEAN_FIELDS = ["create_categories", "create_tags", "skip_existing"] as const;

function asBoolString(value: FormDataEntryValue | null, fallback: boolean): string {
    if (typeof value !== "string") return String(fallback);
    return value === "true" ? "true" : value === "false" ? "false" : String(fallback);
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
        return NextResponse.json({ code: 400, message: "缺少 file 字段（.json 或 .zip 导入文件）", data: null }, { status: 400 });
    }

    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
        return NextResponse.json(
            { code: 400, message: "仅支持 .json 与 .zip 文件（zip 内需含 articles.json）", data: null },
            { status: 400 }
        );
    }
    if (file.size === 0) {
        return NextResponse.json({ code: 400, message: "导入文件是空的", data: null }, { status: 400 });
    }
    if (file.size > MAX_IMPORT_SIZE) {
        return NextResponse.json({ code: 400, message: "导入文件不能超过 100MB", data: null }, { status: 400 });
    }

    const defaultStatusRaw = formData.get("default_status");
    const defaultStatus =
        typeof defaultStatusRaw === "string" && ALLOWED_STATUS.includes(defaultStatusRaw.toUpperCase())
            ? defaultStatusRaw.toUpperCase()
            : "DRAFT";

    // 重建 FormData：只转发白名单字段，避免把客户端塞进来的其它字段一起送给后端
    const forward = new FormData();
    forward.append("file", file, file.name);
    for (const field of BOOLEAN_FIELDS) {
        forward.append(field, asBoolString(formData.get(field), true));
    }
    forward.append("default_status", defaultStatus);

    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) {
        return NextResponse.json({ code: 401, message: "未登录", data: null }, { status: 401 });
    }

    let res: Response;
    try {
        // 直接透传重建后的 FormData（fetch 自动带 multipart boundary，不手写 Content-Type）
        res = await fetch(`${API_URL}/articles/import`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
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
            { code: res.status, message: text || `导入文章失败（HTTP ${res.status}）`, data: null },
            { status: res.ok ? 200 : res.status }
        );
    }

    return NextResponse.json(json, { status: res.ok ? 200 : res.status });
}
