import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { API_URL } from "@/lib/api";
import { ACCESS_TOKEN_KEY } from "@/lib/auth";

// 导出评论：POST /api/admin/comments/export → 远端 POST /comments/export（router.go:287，需管理员登录）。
//
// ⚠️ 这里刻意不用 adminProxyFetch：它会把响应体重新 JSON.parse + NextResponse.json 包一遍，
//    于是 Content-Disposition（下载文件名 comments_export.zip）与 application/zip 的正文都会被破坏；
//    而远端导出接口返回的正是 **ZIP 文件流**而不是 { code, message, data } 信封
//    （pkg/handler/comment/handler.go:617-639）。所以本路由原样透传响应体与下载头，
//    做法与 /api/admin/config/export 一致。
// 请求体：{ ids?: string[] }（pkg/handler/comment/dto/dto.go:140-143；空/缺省 = 导出全部，
// handler.go:619-622 在 body 解析失败时也回落为「全部」）。这里本地先按同一口径校验，
// 非法 body（不是对象 / ids 不是字符串数组 / 元素为空）直接 400，省掉必然失败的往返。
export async function POST(request: NextRequest) {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json(
            { code: 400, message: "请求体格式错误（需 JSON 对象）", data: null },
            { status: 400 }
        );
    }

    if (body === null || typeof body !== "object" || Array.isArray(body)) {
        return NextResponse.json(
            { code: 400, message: "请求体格式错误（需 JSON 对象）", data: null },
            { status: 400 }
        );
    }

    const rawIds = (body as { ids?: unknown }).ids;
    if (rawIds !== undefined && !Array.isArray(rawIds)) {
        return NextResponse.json({ code: 400, message: "ids 必须是字符串数组", data: null }, { status: 400 });
    }

    const ids: string[] = [];
    for (const item of rawIds ?? []) {
        if (typeof item !== "string" || item.trim() === "") {
            return NextResponse.json(
                { code: 400, message: "ids 必须是字符串数组", data: null },
                { status: 400 }
            );
        }
        ids.push(item);
    }

    const cookieStore = await cookies();
    const token = cookieStore.get(ACCESS_TOKEN_KEY)?.value;
    if (!token) {
        return NextResponse.json({ code: 401, message: "未登录", data: null }, { status: 401 });
    }

    let res: Response;
    try {
        res = await fetch(`${API_URL}/comments/export`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            // 只把校验过的 ids 往下传，不原样透传整个 body
            body: JSON.stringify({ ids }),
            cache: "no-store",
        });
    } catch {
        return NextResponse.json({ code: 502, message: "无法连接后端服务", data: null }, { status: 502 });
    }

    if (!res.ok) {
        // 失败时远端返回 JSON 信封（未登录 / 500），转成同形状的 JSON 交给前端提示
        const text = await res.text();
        let json: unknown = null;
        try {
            json = JSON.parse(text);
        } catch {
            // 非 JSON 错误页，按纯文本兜底
        }
        const message =
            (json as { message?: string } | null)?.message || text || `导出评论失败（HTTP ${res.status}）`;
        return NextResponse.json({ code: res.status, message, data: null }, { status: res.status });
    }

    const buffer = await res.arrayBuffer();

    const headers = new Headers();
    headers.set("Content-Type", "application/zip");
    // 文件名由远端决定（comments_export.zip，handler.go:635），前端下载时直接用它
    const disposition = res.headers.get("Content-Disposition");
    if (disposition) headers.set("Content-Disposition", disposition);
    // 注：这里不额外附「导出条数」响应头 —— 远端只回文件流，条数只有解开 ZIP 里的
    // comments.json 才知道，凭空造一个头反而会误导前端，所以条数由调用方按自己的筛选口径提示。
    headers.set("Cache-Control", "no-store");

    return new NextResponse(buffer, { status: 200, headers });
}
