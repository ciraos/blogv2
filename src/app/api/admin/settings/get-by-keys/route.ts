import type { NextRequest } from "next/server";

import { authedProxyFetch } from "@/lib/admin-api";

// 系统设置 · 按需读取（远端 POST /settings/get-by-keys，需登录 + 管理员）
// 请求体 { keys: string[] }；后端返回的 data 是嵌套对象（与 /public/site-config 同构）。
// 说明：本页首屏值直接来自公开的 /public/site-config，这个代理留给「只存在于后台设置里的键」
// （如 SMTP、三方服务密钥）以及保存后的二次校验。
export async function POST(request: NextRequest) {
    let body: { keys?: unknown };
    try {
        body = await request.json();
    } catch {
        return Response.json({ code: 400, message: "请求体格式错误", data: null }, { status: 400 });
    }

    const keys = Array.isArray(body.keys)
        ? body.keys.filter((key): key is string => typeof key === "string" && key.trim() !== "")
        : [];
    if (keys.length === 0) {
        return Response.json({ code: 400, message: "请提供要读取的设置键", data: null }, { status: 400 });
    }

    return authedProxyFetch("/settings/get-by-keys", { method: "POST", body: JSON.stringify({ keys }) });
}
