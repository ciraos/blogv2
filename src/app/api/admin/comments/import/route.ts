import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { API_URL } from "@/lib/api";
import { ACCESS_TOKEN_KEY } from "@/lib/auth";

// 导入评论：POST /api/admin/comments/import → 远端 POST /comments/import
// （router.go:288，需管理员登录；⚠️ 会写评论表，仅实现不在线上实测）。
//
// 不能走 adminProxyFetch：它检测到 body 就补 JSON Content-Type，会破坏 multipart boundary，
// 所以这里手动读 token + 直接透传 FormData（与 /api/admin/config/import 同一做法）。
//
// 远端要求（pkg/handler/comment/handler.go:657-737）：
//  - 字段名 file（必填，handler.go:661）；
//  - 按**文件扩展名**分支（handler.go:706-718）：.json 直接解析，.zip 取包内 comments.json，
//    其它扩展名 → 400「不支持的文件格式，仅支持 .json 和 .zip 文件」；
//  - 可选表单字段 skip_existing / default_status / keep_create_time
//    （handler.go:687-693；注意后端 DefaultPostForm 在字段缺失时把两个 bool 都当 true，
//     所以前端始终显式传值）；
//  - 后端**没有**体积硬限制（全局搜不到 MaxMultipartMemory / MaxBytesReader，文件 io.ReadAll
//    全量进内存），因此下面这个上限属于本地保护：宁可本地拦掉，也不放行一个可能打满后端内存的文件。
const MAX_IMPORT_SIZE = 32 * 1024 * 1024;

/** 允许的默认状态（handler.go:690-693 只接受 1/2，其它值后端回落为 1） */
const ALLOWED_STATUS = [1, 2];

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
        return NextResponse.json({ code: 400, message: "缺少 file 字段（评论数据文件）", data: null }, { status: 400 });
    }

    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith(".json") && !lowerName.endsWith(".zip")) {
        return NextResponse.json({ code: 400, message: "只支持 .json 或 .zip 文件", data: null }, { status: 400 });
    }

    if (file.size > MAX_IMPORT_SIZE) {
        return NextResponse.json({ code: 400, message: "文件大小不能超过 32MB", data: null }, { status: 400 });
    }

    // 选项校验：布尔字段按字符串收（multipart 只能传字符串），default_status 必须在 1/2 之内
    const rawSkipExisting = formData.get("skip_existing");
    const rawKeepCreateTime = formData.get("keep_create_time");
    const rawDefaultStatus = formData.get("default_status");

    if (rawSkipExisting !== null && rawSkipExisting !== "true" && rawSkipExisting !== "false") {
        return NextResponse.json(
            { code: 400, message: "skip_existing 只能是 true 或 false", data: null },
            { status: 400 }
        );
    }
    if (rawKeepCreateTime !== null && rawKeepCreateTime !== "true" && rawKeepCreateTime !== "false") {
        return NextResponse.json(
            { code: 400, message: "keep_create_time 只能是 true 或 false", data: null },
            { status: 400 }
        );
    }
    if (rawDefaultStatus !== null && !ALLOWED_STATUS.includes(Number(rawDefaultStatus))) {
        return NextResponse.json({ code: 400, message: "default_status 只能是 1 或 2", data: null }, { status: 400 });
    }

    const cookieStore = await cookies();
    const token = cookieStore.get(ACCESS_TOKEN_KEY)?.value;
    if (!token) {
        return NextResponse.json({ code: 401, message: "未登录", data: null }, { status: 401 });
    }

    // 只把校验过的字段重新组一遍往下传，不透传客户端可能塞进来的额外字段
    const forward = new FormData();
    forward.append("file", file);
    forward.append("skip_existing", rawSkipExisting === null ? "true" : String(rawSkipExisting));
    forward.append("keep_create_time", rawKeepCreateTime === null ? "true" : String(rawKeepCreateTime));
    forward.append("default_status", rawDefaultStatus === null ? "1" : String(rawDefaultStatus));

    const headers = new Headers();
    headers.set("Authorization", `Bearer ${token}`);

    let res: Response;
    try {
        // 直接透传 FormData（fetch 会自动带上 multipart boundary）
        res = await fetch(`${API_URL}/comments/import`, {
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
            { code: res.status, message: text || `导入评论失败（HTTP ${res.status}）`, data: null },
            { status: res.ok ? 200 : res.status }
        );
    }

    return NextResponse.json(json, { status: res.ok ? 200 : res.status });
}
