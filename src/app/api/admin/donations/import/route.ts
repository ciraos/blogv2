import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { API_URL } from "@/lib/api";
import { ACCESS_TOKEN_KEY } from "@/lib/auth";

// 导入打赏记录：POST /api/admin/donations/import → 远端 POST /pro/admin/donations/import
// （PRO 模块，需管理员登录；⚠️ 会写打赏表，按要求**不在线上实测**）。
//
// 不能走 adminProxyFetch：它检测到 body 就补 JSON Content-Type，会破坏 multipart boundary，
// 所以这里手动读 token + 直接透传 FormData（与 /api/admin/config/import、
// /api/admin/comments/import 同一做法）。
//
// 远端要求（以官方主题前端源码为准，官方 src/lib/api/donation.ts:63-74、
// app/admin/donations/_components/DonationImportDialog.tsx:41-85,155-189）：
//  - 字段名 file（必填，JSON 文件；官方对话框 accept=".json,.txt"）；
//  - skip_existing（"true"/"false"，官方默认 true）；
//  - default_status（0=保持原状态 1=统一设为显示 2=统一设为隐藏，官方默认 0）；
//  - 响应是 { code, message, data: ImportResult } 信封（原样回给前端）。
// 后端体积上限未知，这里的上限属于**本地保护**：宁可本地拦掉，也不放行一个可能打满后端内存的文件。
const MAX_IMPORT_SIZE = 10 * 1024 * 1024;

/** 允许的默认状态策略（0=保持原状态 1=显示 2=隐藏） */
const ALLOWED_STATUS = [0, 1, 2];

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
        return NextResponse.json({ code: 400, message: "缺少 file 字段（打赏数据文件）", data: null }, { status: 400 });
    }

    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith(".json") && !lowerName.endsWith(".txt")) {
        return NextResponse.json({ code: 400, message: "只支持 .json 或 .txt 文件", data: null }, { status: 400 });
    }

    if (file.size > MAX_IMPORT_SIZE) {
        return NextResponse.json({ code: 400, message: "文件大小不能超过 10MB", data: null }, { status: 400 });
    }

    // 选项校验：multipart 只能传字符串，这里按字符串白名单收
    const rawSkipExisting = formData.get("skip_existing");
    const rawDefaultStatus = formData.get("default_status");

    if (rawSkipExisting !== null && rawSkipExisting !== "true" && rawSkipExisting !== "false") {
        return NextResponse.json(
            { code: 400, message: "skip_existing 只能是 true 或 false", data: null },
            { status: 400 }
        );
    }
    if (rawDefaultStatus !== null && !ALLOWED_STATUS.includes(Number(rawDefaultStatus))) {
        return NextResponse.json(
            { code: 400, message: "default_status 只能是 0 / 1 / 2", data: null },
            { status: 400 }
        );
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
    forward.append("default_status", rawDefaultStatus === null ? "0" : String(rawDefaultStatus));

    const headers = new Headers();
    headers.set("Authorization", `Bearer ${token}`);

    let res: Response;
    try {
        // 直接透传 FormData（fetch 会自动带上 multipart boundary）
        res = await fetch(`${API_URL}/pro/admin/donations/import`, {
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
            { code: res.status, message: text || `导入打赏记录失败（HTTP ${res.status}）`, data: null },
            { status: res.ok ? 200 : res.status }
        );
    }

    return NextResponse.json(json, { status: res.ok ? 200 : res.status });
}
