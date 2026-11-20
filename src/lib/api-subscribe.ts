/**
 * 文章订阅（后台 post.subscribe.* / 后端 subscriber 接口）。
 *
 * 后端链路（pkg/handler/subscriber/handler.go）：
 *   POST /public/subscribe/code  { email }        → 发 6 位邮箱验证码
 *   POST /public/subscribe       { email, code }  → 订阅（后端会发确认/欢迎邮件）
 *   DELETE /public/subscribe     { email }        → 直接退订
 *   GET  /public/unsubscribe/{token}              → 邮件里的退订链接
 *
 * 走 `/api/*` 同源代理（和其余公开接口同一套，见 lib/api.ts 的 request 实现约定）。
 */

export interface SubscribeError {
    message: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`/api${path}`, {
        ...init,
        headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    });
    const text = await res.text();
    let body: unknown = null;
    try {
        body = text ? JSON.parse(text) : null;
    } catch {
        body = null;
    }
    const payload = body as { code?: number; message?: string; data?: T } | null;
    if (!res.ok || (payload?.code !== undefined && payload.code !== 200)) {
        throw new Error(payload?.message || `请求失败（HTTP ${res.status}）`);
    }
    return payload?.data as T;
}

/** 发送邮箱验证码（60 秒冷却由调用方控制） */
export async function sendSubscribeCodeApi(email: string): Promise<void> {
    await request<null>("/public/subscribe/code", {
        method: "POST",
        body: JSON.stringify({ email }),
    });
}

/** 用邮箱 + 验证码完成订阅 */
export async function subscribeApi(email: string, code: string): Promise<void> {
    await request<null>("/public/subscribe", {
        method: "POST",
        body: JSON.stringify({ email, code }),
    });
}

/** 退订（邮件里的 token 链接会走到这里） */
export async function unsubscribeByTokenApi(token: string): Promise<void> {
    await request<null>(`/public/unsubscribe/${encodeURIComponent(token)}`);
}
