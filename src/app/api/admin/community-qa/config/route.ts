import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { authedProxyFetch } from "@/lib/admin-api";

/**
 * 社区问答 · 开关（管理员）—— 同源代理，不直连远端。
 *
 * 远端路径（权威证据：线上前台 /questions 实际加载的 chunk，模块 communityQAApi）
 *   公开基址 t = /api/pro/community-qa，管理基址 s = /api/pro/admin/community-qa
 *     config()     → GET  `${t}/config`
 *     setEnabled() → PUT  `${s}/config`  body { enabled: boolean }
 * 只读实测（GET，2026-10）：
 *   GET /api/pro/community-qa/config       → 200 {"code":200,"data":{"enabled":true}}
 *   GET /api/pro/admin/community-qa/config → 401（路由存在，仅缺鉴权）
 *
 * NEXT_PUBLIC_API_URL 已含 /api 后缀，所以这里写 /pro/...（见 src/lib/admin-api.ts）。
 */

/** GET：优先管理端（管理上下文的值）；管理端路由不存在（404）时才退回公开同款接口 */
export async function GET() {
    const viaAdmin = await authedProxyFetch("/pro/admin/community-qa/config", { method: "GET" });
    if (viaAdmin.status !== 404) return viaAdmin;
    return authedProxyFetch("/pro/community-qa/config", { method: "GET" });
}

/** PUT：改开关。只接受 { enabled: boolean }，其它一律 400，不把脏参数透传到远端。 */
export async function PUT(request: NextRequest) {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ code: 400, message: "请求体格式错误", data: null }, { status: 400 });
    }

    const enabled = (body as { enabled?: unknown } | null)?.enabled;
    if (typeof enabled !== "boolean") {
        return NextResponse.json({ code: 400, message: "enabled 必须是布尔值", data: null }, { status: 400 });
    }

    return authedProxyFetch("/pro/admin/community-qa/config", {
        method: "PUT",
        body: JSON.stringify({ enabled }),
    });
}
