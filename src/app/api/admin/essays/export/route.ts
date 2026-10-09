import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { API_URL } from "@/lib/api";

// 导出说说：POST /api/admin/essays/export → 远端 POST /pro/admin/essays/export
// （PRO 模块，需管理员登录；线上只读探活：未带 token 返回 401，同级随机路径是 404）。
//
// ⚠️ 这里刻意不用 adminProxyFetch：它会把响应体重新 JSON.parse + NextResponse.json 包一遍，
//    于是 Content-Disposition（下载文件名）与 ZIP 正文都会被破坏；而远端导出接口返回的正是
//    **文件流**而不是 { code, message, data } 信封（官方 essay.ts:213-224 用
//    axios responseType:"blob" 接收，官方保存名 essays-export-YYYY-MM-DD.zip）。
//    所以本路由原样透传响应体与下载头，做法与 /api/admin/comments/export 一致。
// 请求体：{ essay_ids: number[] }（官方 essay.ts:217-224 的字段名；官方界面要求至少选一条，
//     use-essays-page.ts:130-135，因此这里要求非空，非法 body 本地直接 400）。
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

    const rawIds = (body as { essay_ids?: unknown }).essay_ids;
    if (!Array.isArray(rawIds)) {
        return NextResponse.json({ code: 400, message: "essay_ids 必须是数字数组", data: null }, { status: 400 });
    }

    const essayIds: number[] = [];
    for (const item of rawIds) {
        if (typeof item !== "number" || !Number.isInteger(item) || item <= 0) {
            return NextResponse.json(
                { code: 400, message: "essay_ids 必须是正整数数组", data: null },
                { status: 400 }
            );
        }
        essayIds.push(item);
    }

    if (essayIds.length === 0) {
        return NextResponse.json({ code: 400, message: "请至少选择一条说说再导出", data: null }, { status: 400 });
    }

    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) {
        return NextResponse.json({ code: 401, message: "未登录", data: null }, { status: 401 });
    }

    let res: Response;
    try {
        res = await fetch(`${API_URL}/pro/admin/essays/export`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            // 只把校验过的 ids 往下传，不原样透传整个 body
            body: JSON.stringify({ essay_ids: essayIds }),
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
            (json as { message?: string } | null)?.message || text || `导出说说失败（HTTP ${res.status}）`;
        return NextResponse.json({ code: res.status, message, data: null }, { status: res.status });
    }

    const buffer = await res.arrayBuffer();

    const headers = new Headers();
    // 远端导出的是 ZIP（官方保存名 essays-export-YYYY-MM-DD.zip），有 Content-Type 就透传
    headers.set("Content-Type", res.headers.get("Content-Type") || "application/zip");
    // 文件名由远端决定，前端下载时优先用它（取不到则由前端按日期兜底命名）
    const disposition = res.headers.get("Content-Disposition");
    if (disposition) headers.set("Content-Disposition", disposition);
    headers.set("Cache-Control", "no-store");

    return new NextResponse(buffer, { status: 200, headers });
}
