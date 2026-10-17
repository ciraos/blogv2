import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

import { authedProxyFetch } from "@/lib/admin-api"

/**
 * PUT /api/admin/links/[id]/review → 远端 PUT /links/{id}/review
 *
 * 远端契约（scripts/swagger.yaml 的 /links/{id}/review + model.ReviewLinkRequest）：
 *   body { status: "APPROVED" | "REJECTED"（必填）, reject_reason?, siteshot? }
 *
 * 为什么单独一条路由：审核是独立的动作（有 reject_reason、可能回填 siteshot），
 * 走 PUT /links/{id} 会连带要求整条友链的字段，也留不下审核痕迹。
 */
const REVIEW_STATUSES = ["APPROVED", "REJECTED"] as const

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    if (!id || id.includes("/")) {
        return NextResponse.json({ code: 400, message: "友链 ID 无效", data: null }, { status: 400 })
    }

    let raw: unknown
    try {
        raw = await request.json()
    } catch {
        return NextResponse.json({ code: 400, message: "请求体格式错误（需 JSON）", data: null }, { status: 400 })
    }
    const body = (raw ?? {}) as Record<string, unknown>
    const status = typeof body.status === "string" ? body.status : ""
    if (!REVIEW_STATUSES.includes(status as (typeof REVIEW_STATUSES)[number])) {
        return NextResponse.json(
            { code: 400, message: "status 只能是 APPROVED 或 REJECTED", data: null },
            { status: 400 }
        )
    }

    // 只透传远端认识的三个字段，避免把前端表单里其它键带过去
    const payload: Record<string, string> = { status }
    if (typeof body.reject_reason === "string" && body.reject_reason.trim() !== "") {
        payload.reject_reason = body.reject_reason.trim()
    }
    if (typeof body.siteshot === "string" && body.siteshot.trim() !== "") {
        payload.siteshot = body.siteshot.trim()
    }

    return authedProxyFetch(`/links/${encodeURIComponent(id)}/review`, {
        method: "PUT",
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
    })
}
