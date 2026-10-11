import type { NextRequest } from "next/server";

import { QA_REMOTE_BASE, badId, fail, qaProxy } from "../../_proxy";

/**
 * 社区问答 · 问题详情 —— 同源代理。
 *
 * 远端：GET /api/pro/community-qa/questions/{id}?page=
 *   detail: (id, page = 1) => apiClient.get(`${t}/questions/${encodeURIComponent(id)}`, { params: { page } })
 *   逐字来自线上前台 /questions 的 chunk（模块 343577）。`page` 说明详情响应里
 *   回答是分页的（同列表那套 { list, page, page_size, total } 口径）。
 *
 * ⚠️ 诚实声明：该接口的**响应结构没有取到任何确证样本** ——
 *   线上公开问题列表 total=0（没有可打开的问题），官方详情页的 chunk 无法通过只读方式取得
 *   （/questions/{id} 与不存在的路径一样返回 404；sitemap 里也没有逐条问题 URL），
 *   所以浏览器端只按「候选字段」做容错解析（见 src/lib/api-community-qa-public.ts 的 normalize），
 *   结构对不上时页面会如实说明，而不是编造数据。
 *
 * 无需登录即可看（但带上 token：作者能看到自己「待审核」的问题，这是后端可选登录的语义）。
 */
type Params = Promise<{ id: string }>;

export async function GET(request: NextRequest, { params }: { params: Params }) {
    const { id } = await params;
    const idError = badId(id);
    if (idError) {
        return fail(400, idError);
    }

    const pageRaw = request.nextUrl.searchParams.get("page");
    const page = pageRaw === null || pageRaw === "" ? 1 : Number(pageRaw);
    if (!Number.isInteger(page) || page < 1) {
        return fail(400, "page 必须是不小于 1 的整数");
    }

    return qaProxy(
        request,
        `${QA_REMOTE_BASE}/questions/${encodeURIComponent(id.trim())}?page=${page}`,
        { method: "GET" }
    );
}
