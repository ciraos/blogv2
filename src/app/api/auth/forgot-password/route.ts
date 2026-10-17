import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { publicProxy } from "@/lib/public-proxy";

/**
 * POST /api/auth/forgot-password → 远端 POST /auth/forgot-password
 *
 * 远端契约（scripts/swagger.yaml 的 /auth/forgot-password）：
 *   body { email } → 200「如果该邮箱已注册，将收到重置邮件」；400 邮箱格式不正确。
 *
 * 注意远端**不会**因为邮箱不存在而报错（防枚举），所以这里也只做空值/格式校验，
 * 成功提示统一用「如果该邮箱已注册…」，不根据响应推断邮箱是否存在。
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
    let body: { email?: unknown };
    try {
        body = (await request.json()) as { email?: unknown };
    } catch {
        return NextResponse.json({ code: 400, message: "请求体格式错误", data: null }, { status: 400 });
    }

    const email = typeof body?.email === "string" ? body.email.trim() : "";
    if (!email) {
        return NextResponse.json({ code: 400, message: "请输入邮箱", data: null }, { status: 400 });
    }
    if (!EMAIL_RE.test(email)) {
        return NextResponse.json({ code: 400, message: "邮箱格式不正确", data: null }, { status: 400 });
    }

    return publicProxy("/auth/forgot-password", { method: "POST", body: { email } });
}
