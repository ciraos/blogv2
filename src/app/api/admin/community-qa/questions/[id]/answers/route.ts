import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { authedProxyFetch } from "@/lib/admin-api";

/**
 * 社区问答 · 作答（管理员在本站后台以**当前登录账号**身份回答某个问题）—— 同源代理。
 *
 * 远端：POST /api/pro/community-qa/questions/{id}/answers   body { content }
 *   逐字来自官方 communityQAApi.answer(id, content) → `${t}/questions/{id}/answers`。
 *
 * ⚠️ 注意这是**公开基址**（/pro/community-qa），不是管理端基址：社区问答模块里
 *    **没有「管理员回复」接口**（管理端只有 config / questions / answers / moderation）。
 *    官方后台也是同一套接口，所以后台作答等价于「管理员用自己的账号去前台回答」：
 *    发布后仍由后端按审核策略处理（很可能先落到待审核，再到本页「回答」标签里审批）。
 *
 * ⚠️ 写操作：只做参数校验 + 转发，**未对线上实测过**（任务铁律：只允许 GET 探活）。
 */

/** 回答内容长度上限（对齐前台输入框 maxLength=10000，见 /questions 页 chunk） */
const MAX_CONTENT = 10000;

type Params = Promise<{ id: string }>;

export async function POST(request: NextRequest, { params }: { params: Params }) {
    const { id } = await params;
    if (!id?.trim()) {
        return NextResponse.json({ code: 400, message: "id 不能为空", data: null }, { status: 400 });
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ code: 400, message: "请求体格式错误", data: null }, { status: 400 });
    }

    const content = (body as { content?: unknown } | null)?.content;
    if (typeof content !== "string" || !content.trim()) {
        return NextResponse.json({ code: 400, message: "content 不能为空", data: null }, { status: 400 });
    }
    if (content.trim().length > MAX_CONTENT) {
        return NextResponse.json(
            { code: 400, message: `content 最长 ${MAX_CONTENT} 个字符`, data: null },
            { status: 400 }
        );
    }

    return authedProxyFetch(`/pro/community-qa/questions/${encodeURIComponent(id)}/answers`, {
        method: "POST",
        body: JSON.stringify({ content: content.trim() }),
    });
}
