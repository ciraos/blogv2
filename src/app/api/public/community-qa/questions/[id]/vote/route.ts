import type { NextRequest } from "next/server";

import { QA_REMOTE_BASE, badId, fail, qaProxy } from "../../../_proxy";

/**
 * 社区问答 · 给**问题**点赞 —— 同源代理。
 *
 * 远端：PUT /api/pro/community-qa/questions/{id}/vote   body { liked }
 *   vote: (e, s, n) => apiClient.put(`${t}/${e}/${encodeURIComponent(s)}/vote`, { liked: n })
 *   逐字来自线上前台 /questions 的 chunk（模块 343577）。
 *
 * 参数顺序的判据（不敢乱猜，这里是唯一能站得住的推理）：路径是 `${t}/{e}/{encodeURIComponent(s)}/vote`，
 *   · 只有 s 被 encodeURIComponent —— 会被编码的是**id**（type 是字面量，不需要编码）；
 *   · e 直接进路径当段名 —— 只可能是 "questions" / "answers"（与同模块 list/detail 的路径段一致）。
 *   所以本文件的 type 段固定写成 questions，只从 URL 取 id。**该推理已写进报告，需你按实际线上行为复核。**
 *
 * ⚠️ 写操作：只做参数校验 + 转发，**未端到端实测**。liked 只接受布尔值，不替用户猜语义。
 */
type Params = Promise<{ id: string }>;

export async function PUT(request: NextRequest, { params }: { params: Params }) {
    const { id } = await params;
    const idError = badId(id);
    if (idError) {
        return fail(400, idError);
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return fail(400, "请求体格式错误");
    }

    const liked = (body as { liked?: unknown } | null)?.liked;
    if (typeof liked !== "boolean") {
        return fail(400, "liked 必须是布尔值");
    }

    return qaProxy(
        request,
        `${QA_REMOTE_BASE}/questions/${encodeURIComponent(id.trim())}/vote`,
        { method: "PUT", body: JSON.stringify({ liked }) },
        { requireLogin: true }
    );
}
