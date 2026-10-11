import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { authedProxyFetch } from "@/lib/admin-api";

/**
 * 社区问答 · 问题列表（管理员）—— 同源代理。
 *
 * 远端：GET /api/pro/admin/community-qa/questions?page=&status=
 *   · 存在性：只读实测 GET → 401（路由存在，仅缺鉴权）。
 *   · 路径来源：官方 communityQAApi.list(params, true) → 管理基址 `${s}/questions`。
 *   · 参数名：page / page_size / total 取自公开列表实测 200 响应
 *     {"list":[],"page":1,"page_size":20,"total":0}；status 取自同模块
 *     moderationAnswers(status, page)（回答列表用的是同一套分页 + status 口径）。
 *
 * page_size **不发送**：远端默认 20（公开接口实测），由后端决定，页脚按响应的
 * page_size 反算总页数，不替后端做主。
 */

/** 审核状态枚举（同模块 qaStatus 的三个键：PENDING / APPROVED / REJECTED） */
const STATUSES = new Set(["PENDING", "APPROVED", "REJECTED"]);

export async function GET(request: NextRequest) {
    const sp = request.nextUrl.searchParams;

    const pageRaw = sp.get("page");
    const page = pageRaw === null || pageRaw === "" ? 1 : Number(pageRaw);
    if (!Number.isInteger(page) || page < 1) {
        return NextResponse.json({ code: 400, message: "page 必须是不小于 1 的整数", data: null }, { status: 400 });
    }

    const status = sp.get("status");
    if (status !== null && status !== "" && !STATUSES.has(status)) {
        return NextResponse.json(
            { code: 400, message: "status 只接受 PENDING / APPROVED / REJECTED", data: null },
            { status: 400 }
        );
    }

    const qs = new URLSearchParams({ page: String(page) });
    if (status) qs.set("status", status);

    return authedProxyFetch(`/pro/admin/community-qa/questions?${qs.toString()}`, { method: "GET" });
}
