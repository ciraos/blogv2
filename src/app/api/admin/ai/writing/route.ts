import { NextRequest, NextResponse } from "next/server";

import { rawAdminProxyFetch } from "@/lib/admin-api";

// AI 写作 · 生成（PRO 模块，线上已激活）。
// 远端路径证据见 src/lib/api-ai.ts 顶部注释：官方前端 ai-writing.ts:39 调
// POST /api/pro/admin/ai/writing（SSE 流式）；线上 GET /api/pro/admin/ai/writing/config 返回 401。
//
// 这里**不用** adminProxyFetch：它会把整包响应 text() 完再包成 JSON 信封，
// 流式输出会被攒成一坨（并且 SSE 体不是 JSON）。所以直接用 rawAdminProxyFetch
// 拿原始 Response，再把 body 原样透传给浏览器。
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ code: 400, message: "请求体格式错误", data: null }, { status: 400 });
    }

    let upstream: Response | null;
    try {
        upstream = await rawAdminProxyFetch("/pro/admin/ai/writing", {
            method: "POST",
            body: JSON.stringify(body),
        });
    } catch {
        return NextResponse.json({ code: 502, message: "无法连接后端服务", data: null }, { status: 502 });
    }
    if (!upstream) {
        return NextResponse.json({ code: 401, message: "未登录", data: null }, { status: 401 });
    }

    // 失败（非 2xx）时上游回的是 JSON 信封，没有流可言 —— 按原文返回，前端拿得到 message。
    if (!upstream.ok) {
        const text = await upstream.text();
        let json: unknown = null;
        try {
            json = JSON.parse(text);
        } catch {
            // 非 JSON → 下面兜底成纯文本 message
        }
        return NextResponse.json(
            json ?? { code: upstream.status, message: text || `请求失败（HTTP ${upstream.status}）`, data: null },
            { status: upstream.status }
        );
    }

    const headers = new Headers();
    const contentType = upstream.headers.get("content-type");
    if (contentType) headers.set("content-type", contentType);
    // no-transform + x-accel-buffering：让 nginx 之类反代别攒流，否则打字机效果会变成一次性输出
    headers.set("cache-control", "no-store, no-transform");
    headers.set("x-accel-buffering", "no");

    return new Response(upstream.body, { status: 200, headers });
}
