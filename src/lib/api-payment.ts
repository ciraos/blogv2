// 支付配置（PRO）的数据层：客户端一律打本站同源代理，由 Route Handler 带 Bearer 转发。
//
// 为什么单独一个文件、不进 src/lib/api.ts：那支文件被前台和几十个页面依赖，
// 这里按既有约定（同 api-knowledge.ts / api-ai.ts / api-notifications.ts）另开一支。
//
// 远端接口对照（官方 src/lib/api/payment.ts:105-157）：
//   GET  /pro/payment/config/details          读全部配置（含明文密钥与 has_* 标志）
//   POST /pro/payment/config/{slug}           保存某方式配置（slug = alipay|wechat|epay|hupijiao）
//   POST /pro/payment/config/{PROVIDER}/toggle 启用/停用（PROVIDER 大写）
//   POST /pro/payment/config/{PROVIDER}/test   测试连接（PROVIDER 大写）

import { ApiError } from "@/lib/api";
import type { ApiEnvelope as Envelope } from "@/lib/api";
import type { PaymentConfigDetails, PaymentFormValues, PaymentProviderSlug } from "@/types/payment";

/** 发一个请求并把信封解开；失败抛 ApiError（形状与 @/lib/api 一致） */
async function send<T>(path: string, method: "GET" | "POST", payload?: unknown): Promise<{ data: T; message: string }> {
    const headers = new Headers();
    if (payload !== undefined) headers.set("Content-Type", "application/json");

    let res: Response;
    try {
        res = await fetch(path, {
            method,
            headers,
            body: payload === undefined ? undefined : JSON.stringify(payload),
            cache: "no-store",
        });
    } catch {
        throw new ApiError("网络请求失败，请检查网络连接", 0, 0);
    }

    let json: Envelope<T> | null = null;
    try {
        json = (await res.json()) as Envelope<T>;
    } catch {
        // 非 JSON（网关错误页等），走下面的 HTTP 状态兜底
    }

    if (res.ok && json && (json.code === 200 || json.code === 0)) {
        return { data: json.data, message: json.message ?? "" };
    }
    throw new ApiError(json?.message || `请求失败（HTTP ${res.status}）`, res.status, json?.code ?? res.status);
}

/** GET /api/pro/payment/config/details —— 读全部支付配置 */
export async function getPaymentConfigDetailsApi(): Promise<PaymentConfigDetails> {
    const { data } = await send<PaymentConfigDetails>("/api/pro/payment/config/details", "GET");
    return data;
}

/** POST /api/pro/payment/config/{slug} —— 保存某个支付方式的配置 */
export async function savePaymentConfigApi(slug: PaymentProviderSlug, values: PaymentFormValues): Promise<void> {
    await send<null>(`/api/pro/payment/config/${slug}`, "POST", values);
}

/**
 * POST /api/pro/payment/config/{slug}/toggle —— 启用 / 停用。
 * 这里传**小写 slug**（同源路由的路径段），大写到远端枚举的映射在 Route Handler 里做：
 * 远端要的是 /pro/payment/config/ALIPAY/toggle，直接拼大写枚举会被同源路由的白名单挡掉。
 */
export async function togglePaymentProviderApi(slug: PaymentProviderSlug, enabled: boolean): Promise<void> {
    await send<null>(`/api/pro/payment/config/${slug}/toggle`, "POST", { enabled });
}

/** POST /api/pro/payment/config/{slug}/test —— 测试连接，返回后端的提示文案 */
export async function testPaymentConfigApi(slug: PaymentProviderSlug): Promise<string> {
    const { message } = await send<null>(`/api/pro/payment/config/${slug}/test`, "POST");
    return message;
}
