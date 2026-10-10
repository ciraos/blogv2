import { adminProxyFetch } from "@/lib/admin-api";

// AI 写作 · 读取配置（PRO）。
// 线上证据：GET /api/pro/admin/ai/writing/config 未登录返回 401 ⇒ 该路由存在、需鉴权。
// 用途：弹窗打开时先看后端是否配好模型，没配好就只提示去设置页，不白跑一次生成（生成是要计费的）。
export const dynamic = "force-dynamic";

export async function GET() {
    return adminProxyFetch("/pro/admin/ai/writing/config", { method: "GET" });
}
