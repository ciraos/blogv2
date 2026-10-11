import type { NextRequest } from "next/server";

import { QA_LIMITS, QA_REMOTE_BASE, badId, fail, qaProxy } from "../../../_proxy";

/**
 * 社区问答 · 回答某个问题 —— 同源代理。
 *
 * 远端：POST /api/pro/community-qa/questions/{id}/answers   body { content }
 *   answer: (id, content) => apiClient.post(`${t}/questions/${encodeURIComponent(id)}/answers`, { content })
 *   逐字来自线上前台 /questions 的 chunk（模块 343577）。
 *   注意这是**公开基址**，不是管理端基址（社区问答模块没有管理员专用回复接口）。
 *
 * ⚠️ 写操作：只做参数校验 + 转发，**未端到端实测**（铁律：只允许 GET 探活）。
 * 需要登录：未登录时本地直接 401「请先登录后再操作」，前端据此给明确提示。
 */
type Params = Promise<{ id: string }>;

export async function POST(request: NextRequest, { params }: { params: Params }) {
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

    const content = (body as { content?: unknown } | null)?.content;
    if (typeof content !== "string" || !content.trim()) {
        return fail(400, "content 不能为空");
    }
    if (content.trim().length > QA_LIMITS.answerMax) {
        return fail(400, `content 最长 ${QA_LIMITS.answerMax} 个字符`);
    }

    return qaProxy(
        request,
        `${QA_REMOTE_BASE}/questions/${encodeURIComponent(id.trim())}/answers`,
        { method: "POST", body: JSON.stringify({ content: content.trim() }) },
        { requireLogin: true }
    );
}
