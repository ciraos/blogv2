import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

import { authedProxyFetch } from "@/lib/admin-api"

/**
 * POST /api/admin/settings/test-email → 远端 POST /settings/test-email
 *
 * 远端契约（scripts/swagger.yaml 的 /settings/test-email + dto.TestEmailRequest）：
 *   body { to_email }（必填）→ 200 发送成功；400 参数错误；500 发送失败。
 *
 * ⚠️ 这是**会真的发信**的写操作：只在管理员显式点「发送测试邮件」时调用，
 * 不要在页面加载或自动流程里触发。
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(request: NextRequest) {
    let body: { to_email?: unknown }
    try {
        body = (await request.json()) as { to_email?: unknown }
    } catch {
        return NextResponse.json({ code: 400, message: "请求体格式错误", data: null }, { status: 400 })
    }

    const toEmail = typeof body?.to_email === "string" ? body.to_email.trim() : ""
    if (!toEmail) {
        return NextResponse.json({ code: 400, message: "请填写收件邮箱", data: null }, { status: 400 })
    }
    if (!EMAIL_RE.test(toEmail)) {
        return NextResponse.json({ code: 400, message: "邮箱格式不正确", data: null }, { status: 400 })
    }

    return authedProxyFetch("/settings/test-email", {
        method: "POST",
        body: JSON.stringify({ to_email: toEmail }),
        headers: { "Content-Type": "application/json" },
    })
}
