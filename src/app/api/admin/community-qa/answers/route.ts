import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { authedProxyFetch } from "@/lib/admin-api";

/**
 * 社区问答 · 回答列表（管理员）—— 同源代理。
 *
 * 远端：GET /api/pro/admin/community-qa/answers?status=&page=
 *   · 路径与参数名都是**逐字**来自官方 communityQAApi.moderationAnswers(status, page=1)
 *     → `${s}/answers`，params { status, page }（这是本模块里唯一显式写死参数名的管理端列表接口）。
 *   · 存在性：只读实测 GET /api/pro/admin/community-qa/answers → 401（路由存在，仅缺鉴权）。
 *
 * 与问题列表的差别：这里 page **总是发送**（官方就是恒发 page），status 为空时省略表示「全部」。
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

    return authedProxyFetch(`/pro/admin/community-qa/answers?${qs.toString()}`, { method: "GET" });
}
