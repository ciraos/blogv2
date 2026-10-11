import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { authedProxyFetch } from "@/lib/admin-api";

/**
 * 社区问答 · 审核（管理员）—— 同源代理；覆盖「问题」与「回答」两种内容类型。
 *
 * 远端：PUT /api/pro/admin/community-qa/{type}/{id}/moderation   body { status, reason }
 *   逐字来自官方 communityQAApi.moderate(type, id, status, reason = "")
 *   → `${s}/${type}/${encodeURIComponent(id)}/moderation`，body { status, reason }。
 *   type 的取值由同模块的两个列表接口决定：`questions`（list）与 `answers`（moderationAnswers）。
 *   存在性：只读实测 GET /api/pro/admin/community-qa/questions → 401（管理端前缀存在，仅缺鉴权）。
 *
 * ⚠️ 写操作：本代理只做参数校验 + 转发，**未对线上实测过**（任务铁律：只允许 GET 探活）。
 */

/** 内容类型（远端路径段，白名单，避免拼出任意路径） */
const TYPES = new Set(["questions", "answers"]);

/** 审核状态（同模块 qaStatus：PENDING 待审核 / APPROVED 已公开 / REJECTED 未通过审核） */
const STATUSES = new Set(["PENDING", "APPROVED", "REJECTED"]);

/** 审核意见长度上限（远端未给出限制，这里只做防御性截断校验，避免把超长文本透传） */
const MAX_REASON = 500;

type Params = Promise<{ type: string; id: string }>;

export async function PUT(request: NextRequest, { params }: { params: Params }) {
    const { type, id } = await params;

    if (!TYPES.has(type)) {
        return NextResponse.json({ code: 400, message: "type 只接受 questions / answers", data: null }, { status: 400 });
    }
    if (!id?.trim()) {
        return NextResponse.json({ code: 400, message: "id 不能为空", data: null }, { status: 400 });
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ code: 400, message: "请求体格式错误", data: null }, { status: 400 });
    }

    const payload = (body ?? {}) as { status?: unknown; reason?: unknown };
    if (typeof payload.status !== "string" || !STATUSES.has(payload.status)) {
        return NextResponse.json(
            { code: 400, message: "status 只接受 PENDING / APPROVED / REJECTED", data: null },
            { status: 400 }
        );
    }

    // reason 可选：缺省按官方默认空串处理，非字符串一律 400
    let reason = "";
    if (payload.reason !== undefined && payload.reason !== null) {
        if (typeof payload.reason !== "string") {
            return NextResponse.json({ code: 400, message: "reason 必须是字符串", data: null }, { status: 400 });
        }
        reason = payload.reason.trim();
        if (reason.length > MAX_REASON) {
            return NextResponse.json(
                { code: 400, message: `reason 最长 ${MAX_REASON} 个字符`, data: null },
                { status: 400 }
            );
        }
    }

    // 两个分支各写一条**字面量**远端路径（而不是拼 `${type}`）：
    //   · 可读性上 type 已经过白名单校验，等价；
    //   · 让「代理路径体检」scripts/check-proxy-paths.mjs 能抽出真实前缀并只读探活
    //     （GET /api/pro/admin/community-qa/questions/ 与 /answers/ 实测 301，属「路由存在」，
    //      而拼串形式会被它抽成 /pro/admin/community-qa/ 这个并不存在的路径 → 误报 404）。
    const remoteBody = JSON.stringify({ status: payload.status, reason });
    if (type === "questions") {
        return authedProxyFetch(`/pro/admin/community-qa/questions/${encodeURIComponent(id)}/moderation`, {
            method: "PUT",
            body: remoteBody,
        });
    }
    return authedProxyFetch(`/pro/admin/community-qa/answers/${encodeURIComponent(id)}/moderation`, {
        method: "PUT",
        body: remoteBody,
    });
}
