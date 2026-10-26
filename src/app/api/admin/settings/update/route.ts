import type { NextRequest } from "next/server";
import { revalidateTag } from "next/cache";

import { authedProxyFetch } from "@/lib/admin-api";
import { SITE_CONFIG_TAG } from "@/lib/api";

// 系统设置 · 保存（远端 POST /settings/update，需登录 + 管理员）
// 请求体是「后端键 → 值」的扁平 map（后端键是点号路径，如 footer.socialBar.left）。
// 与官方一致：只提交改动项；布尔/数字/JSON 一律以字符串提交（JSON 用 JSON.stringify）。
export async function POST(request: NextRequest) {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return Response.json({ code: 400, message: "请求体格式错误", data: null }, { status: 400 });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return Response.json({ code: 400, message: "请求体格式错误", data: null }, { status: 400 });
    }

    const payload: Record<string, string> = {};
    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
        if (!key.trim() || value === undefined) continue;
        if (typeof value === "string") payload[key] = value;
        else if (typeof value === "number" || typeof value === "boolean") payload[key] = String(value);
        else payload[key] = JSON.stringify(value);
    }
    if (Object.keys(payload).length === 0) {
        return Response.json({ code: 400, message: "没有需要保存的更改", data: null }, { status: 400 });
    }

    const res = await authedProxyFetch("/settings/update", { method: "POST", body: JSON.stringify(payload) });
    // 设置保存成功 → 站点配置缓存立刻失效（否则前台最多要等 60 秒才用上新配置）
    if (res.ok) revalidateTag(SITE_CONFIG_TAG, { expire: 0 });
    return res;
}
