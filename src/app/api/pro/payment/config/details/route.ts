import { authedProxyFetch } from "@/lib/admin-api";

// 支付配置 · 读全部：GET /api/pro/payment/config/details → 远端 /pro/payment/config/details
// 远端返回 { code, message, data: PaymentConfigDetails }（形状见 src/types/payment.ts）。
// 这是只读接口，PRO 侧要求登录 + 管理员。
export async function GET() {
    return authedProxyFetch("/pro/payment/config/details", { method: "GET" });
}
