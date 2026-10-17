import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { publicProxy } from "@/lib/public-proxy";

/**
 * POST /api/auth/reset-password → 远端 POST /auth/reset-password
 *
 * 远端契约（scripts/swagger.yaml 的 /auth/reset-password）：
 *   body { password, repeatPassword, publicUserId, sign } → 200 重置成功；
 *   400 参数错误 / 链接无效 / 两次密码不一致；401 重置失败。
 *
 * publicUserId 与 sign 来自重置邮件里的链接，页面用 ?publicUserId=&sign= 承接
 * （与 /activate 的激活链接同一套参数名）。
 */
const MIN_PASSWORD = 6;

export async function POST(request: NextRequest) {
    let body: Record<string, unknown>;
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ code: 400, message: "请求体格式错误", data: null }, { status: 400 });
    }

    const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
    const publicUserId = str(body?.publicUserId);
    const sign = str(body?.sign);
    const password = typeof body?.password === "string" ? body.password : "";
    const repeatPassword = typeof body?.repeatPassword === "string" ? body.repeatPassword : "";

    if (!publicUserId || !sign) {
        return NextResponse.json({ code: 400, message: "重置链接无效或缺少参数", data: null }, { status: 400 });
    }
    if (password.length < MIN_PASSWORD) {
        return NextResponse.json({ code: 400, message: `密码至少 ${MIN_PASSWORD} 位`, data: null }, { status: 400 });
    }
    if (password !== repeatPassword) {
        return NextResponse.json({ code: 400, message: "两次输入的密码不一致", data: null }, { status: 400 });
    }

    return publicProxy("/auth/reset-password", {
        method: "POST",
        body: { publicUserId, sign, password, repeatPassword },
    });
}
