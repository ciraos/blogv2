import type { NextRequest } from "next/server";

import { adminToken } from "@/lib/admin-api";
import { API_URL } from "@/lib/api";

/**
 * POST /api/admin/ai/models —— 代取上游 AI 服务的「可用模型」列表。
 *
 * 请求体：`{ api_url, api_key }`；响应：`{ data: { models: string[], source: string } }`。
 *
 * 为什么必须服务端代取：
 *  1. 各家 AI 服务（OpenAI / DeepSeek / new-api 之类）基本都不发 CORS 头，浏览器直连必被拦；
 *  2. 密钥不该出现在对第三方域名的浏览器请求里（服务端转发，浏览器侧不留痕）。
 *
 * 鉴权：`/admin` 页面有 proxy.ts 守卫，但 `/api/admin/*` 没有，所以这里自己校验
 * —— 拿 cookie 里的 token 问远端 /user/info，`userGroupID === 1` 才算管理员。
 * 没有这层校验的话，这个路由会变成「任何登录用户都能让服务器去请求任意 URL」的跳板。
 */
const TIMEOUT_MS = 15000;

/**
 * 由「聊天补全地址」推出 `/models` 的候选 URL。
 * 线上 ai.ciraos.top 这类 new-api 填的是 `…/v1/chat/completions`，而模型列表在 `…/v1/models`；
 * 只填域名（没写 /v1）的服务再补一个 `/v1/models` 兜底。
 */
function modelsUrls(apiUrl: string): string[] {
    const base = apiUrl
        .trim()
        .replace(/\/+$/, "")
        .replace(/\/chat\/completions$/i, "")
        .replace(/\/completions$/i, "");
    const urls = [`${base}/models`];
    if (!/\/v\d+$/i.test(base)) urls.push(`${base}/v1/models`);
    return urls;
}

/**
 * 兼容几种常见的模型列表形状：
 *  - OpenAI 兼容：`{ data: [{ id: "gpt-4o-mini", … }] }`
 *  - Ollama / 部分网关：`{ models: [{ name: "llama3" }] }`、`{ data: { models: [...] } }`
 *  - 裸数组：`["a","b"]` 或 `[{ id }]`
 */
function extractModels(payload: unknown): string[] {
    const names = new Set<string>();
    const take = (list: unknown) => {
        if (!Array.isArray(list)) return;
        for (const item of list) {
            if (typeof item === "string") {
                if (item.trim()) names.add(item.trim());
                continue;
            }
            if (!item || typeof item !== "object") continue;
            const record = item as Record<string, unknown>;
            const name = [record.id, record.name, record.model].find(
                (value): value is string => typeof value === "string" && value.trim().length > 0
            );
            if (name) names.add(name.trim());
        }
    };
    if (Array.isArray(payload)) take(payload);
    else if (payload && typeof payload === "object") {
        const record = payload as Record<string, unknown>;
        take(record.data);
        take(record.models);
        if (record.data && typeof record.data === "object") take((record.data as Record<string, unknown>).models);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
}

/** 错误信封：与站点其它接口保持 { code, message, data } 形状 */
function fail(status: number, message: string) {
    return Response.json({ code: status, message, data: null }, { status });
}

export async function POST(request: NextRequest) {
    const token = await adminToken();
    if (!token) return fail(401, "未登录");

    // 管理员校验（/api/admin/* 不在 proxy.ts 的守卫范围内）
    try {
        const infoRes = await fetch(`${API_URL}/user/info`, {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
        });
        const info = (await infoRes.json()) as { data?: { userGroupID?: number } };
        if (!infoRes.ok || info?.data?.userGroupID !== 1) return fail(403, "需要管理员权限");
    } catch {
        return fail(502, "无法校验登录状态，请稍后重试");
    }

    let body: { api_url?: unknown; api_key?: unknown } = {};
    try {
        body = (await request.json()) as typeof body;
    } catch {
        return fail(400, "请求体格式错误");
    }
    const apiUrl = typeof body.api_url === "string" ? body.api_url.trim() : "";
    const apiKey = typeof body.api_key === "string" ? body.api_key.trim() : "";
    if (!/^https?:\/\//i.test(apiUrl)) return fail(400, "API 地址需要以 http:// 或 https:// 开头");
    if (!apiKey) return fail(400, "缺少 API Key：已存的 Key 读不回来时，请先在输入框里重新填一次");

    let lastError = "";
    for (const url of modelsUrls(apiUrl)) {
        try {
            const res = await fetch(url, {
                headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
                cache: "no-store",
                // 不跟随跳转：避免被上游重定向到别的主机（这个路由是登录管理员触发的，仍不该当跳板）
                redirect: "manual",
                signal: AbortSignal.timeout(TIMEOUT_MS),
            });
            if (res.status === 401 || res.status === 403) {
                return fail(401, "上游拒绝了这把 API Key（401/403），检查一下 Key 是否正确");
            }
            if (!res.ok) {
                lastError = `HTTP ${res.status}`;
                continue;
            }
            const payload = (await res.json()) as unknown;
            const models = extractModels(payload);
            if (models.length === 0) {
                lastError = "上游没有返回任何模型";
                continue;
            }
            return Response.json({
                code: 200,
                message: `获取到 ${models.length} 个模型`,
                data: { models, source: url },
            });
        } catch (error) {
            lastError = error instanceof Error ? error.message : String(error);
        }
    }
    return fail(502, `获取模型失败：${lastError || "未知错误"}`);
}
