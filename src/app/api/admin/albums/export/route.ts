import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { API_URL } from "@/lib/api";

// 相册管理 · 导出：POST /api/admin/albums/export → 远端 POST /albums/export
// （router.go:436-437，需管理员登录）。
//
// ⚠️ 这里刻意不用 adminProxyFetch：它会把响应体重新 JSON.parse + NextResponse.json 包一遍，
//    于是 Content-Disposition（下载文件名）与远端正文都会被破坏；
//    而远端导出接口返回的是**文件流**而不是 { code, message, data } 信封
//    （pkg/handler/album/handler.go:430-503）：
//      - format=zip → application/zip 二进制（handler.go:470-485）；
//      - format=json → 也是裸 JSON（导出结构本身，没有 code/message/data 外壳），
//        只是额外带了 attachment 头（handler.go:486-502）。
//    所以本路由原样透传响应体与下载头，做法与 /api/admin/config/export 一致。
//
// 请求体：{ album_ids?: number[], format?: "json" | "zip" }（handler.go:431-434）。
//   album_ids 为空 / 缺省 = 导出全部相册（handler.go:441-462）；
//   format 缺省为 json。
// 非法 body（不是对象 / album_ids 不是正整数数组 / format 不是 json|zip）本地直接 400，
// 省掉必然失败的往返。
const ALLOWED_FORMATS = ["json", "zip"];

function badRequest(message: string): NextResponse {
    return NextResponse.json({ code: 400, message, data: null }, { status: 400 });
}

export async function POST(request: NextRequest) {
    let raw: unknown;
    try {
        raw = await request.json();
    } catch {
        return badRequest("请求体格式错误（需 JSON 对象）");
    }
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
        return badRequest("请求体格式错误（需 JSON 对象）");
    }

    const body = raw as Record<string, unknown>;
    const rawIds = body.album_ids;
    if (rawIds !== undefined && !Array.isArray(rawIds)) {
        return badRequest("album_ids 必须是数字数组");
    }

    const albumIds: number[] = [];
    for (const item of rawIds ?? []) {
        if (typeof item !== "number" || !Number.isInteger(item) || item <= 0) {
            return badRequest("album_ids 必须是正整数数组");
        }
        albumIds.push(item);
    }

    let format = "json";
    if (body.format !== undefined) {
        if (typeof body.format !== "string" || !ALLOWED_FORMATS.includes(body.format.toLowerCase())) {
            return badRequest("format 只能是 json 或 zip");
        }
        format = body.format.toLowerCase();
    }

    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) {
        return NextResponse.json({ code: 401, message: "未登录", data: null }, { status: 401 });
    }

    let res: Response;
    try {
        res = await fetch(`${API_URL}/albums/export`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            // 只把校验过的字段往下传，不原样透传整个 body
            body: JSON.stringify({ album_ids: albumIds, format }),
            cache: "no-store",
        });
    } catch {
        return NextResponse.json({ code: 502, message: "无法连接后端服务", data: null }, { status: 502 });
    }

    if (!res.ok) {
        // 失败时远端返回 JSON 信封（参数错误 / 500），转成同形状的 JSON 交给前端提示
        const text = await res.text();
        let json: unknown = null;
        try {
            json = JSON.parse(text);
        } catch {
            // 非 JSON 错误页，按纯文本兜底
        }
        const message =
            (json as { message?: string } | null)?.message || text || `导出相册失败（HTTP ${res.status}）`;
        return NextResponse.json({ code: res.status, message, data: null }, { status: res.status });
    }

    const buffer = await res.arrayBuffer();

    const headers = new Headers();
    // 远端两个分支都给 Content-Type；兜底按 format 猜（json → application/json）
    headers.set("Content-Type", res.headers.get("Content-Type") || (format === "zip" ? "application/zip" : "application/json"));
    // 文件名由远端决定（albums-export-YYYYMMDD-HHMMSS.json/.zip，handler.go:480,496），前端下载时直接用它
    const disposition = res.headers.get("Content-Disposition");
    if (disposition) headers.set("Content-Disposition", disposition);
    headers.set("Cache-Control", "no-store");

    return new NextResponse(buffer, { status: 200, headers });
}
