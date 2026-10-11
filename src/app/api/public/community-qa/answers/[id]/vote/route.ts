import type { NextRequest } from "next/server";

import { QA_REMOTE_BASE, badId, fail, qaProxy } from "../../../_proxy";

/**
 * 社区问答 · 给**回答**点赞 —— 同源代理。
 *
 * 远端：PUT /api/pro/community-qa/answers/{id}/vote   body { liked }
 *   同模块 vote(e, s, n) => put(`${t}/${e}/${encodeURIComponent(s)}/vote`, { liked: n })，
 *   这里 e 固定 "answers"（另一支是 questions，见 ../questions/[id]/vote/route.ts 的参数顺序说明）。
 *
 * ⚠️ 写操作：只做参数校验 + 转发，**未端到端实测**。
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
        `${QA_REMOTE_BASE}/answers/${encodeURIComponent(id.trim())}/vote`,
        { method: "PUT", body: JSON.stringify({ liked }) },
        { requireLogin: true }
    );
}
