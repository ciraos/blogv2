import type { NextRequest } from "next/server";

import { QA_REMOTE_BASE, badId, fail, qaProxy } from "../../../_proxy";

/**
 * 社区问答 · 采纳某个回答 —— 同源代理。
 *
 * 远端：PUT /api/pro/community-qa/questions/{id}/accept   body { answer_id }
 *   accept: (e, s) => apiClient.put(`${t}/questions/${encodeURIComponent(e)}/accept`, { answer_id: s })
 *   逐字来自线上前台 /questions 的 chunk（模块 343577）。
 *   这里 `${t}/questions/...` 的 questions 是**字面量**（不像 vote 那样由调用方传），
 *   所以路径结构没有歧义：e = 问题 id，s = 回答 id。
 *
 * ⚠️ 写操作：只做参数校验 + 转发，**未端到端实测**。
 * answer_id 允许 string / number（官方直接把变量塞进 body，没有转换），这里原样透传，只 trim 字符串。
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

    const rawAnswerId = (body as { answer_id?: unknown } | null)?.answer_id;
    let answerId: string | number | null = null;
    if (typeof rawAnswerId === "number" && Number.isFinite(rawAnswerId)) {
        answerId = rawAnswerId;
    } else if (typeof rawAnswerId === "string" && rawAnswerId.trim()) {
        answerId = rawAnswerId.trim();
    }
    if (answerId === null) {
        return fail(400, "answer_id 不能为空");
    }

    return qaProxy(
        request,
        `${QA_REMOTE_BASE}/questions/${encodeURIComponent(id.trim())}/accept`,
        { method: "PUT", body: JSON.stringify({ answer_id: answerId }) },
        { requireLogin: true }
    );
}
