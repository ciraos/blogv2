import type { NextRequest } from "next/server";

import { QA_LIMITS, QA_REMOTE_BASE, QA_STATUSES, fail, qaProxy } from "../_proxy";

/**
 * 社区问答 · 问题列表（GET）与 发起提问（POST）—— 同源代理。
 *
 * 远端（路径与参数名逐字来自线上前台 /questions 的 chunk，模块 343577）：
 *   GET  /api/pro/community-qa/questions?page=&mine=&keyword=&tag=
 *        list: (params, adm) => apiClient.get(`${adm ? 管理基址 : t}/questions`, { params })
 *        页面把状态原样传进去：{ page: 1, mine: false, keyword: "", tag: "" }
 *        （所以「我的提问」的参数名就是 mine=true，搜索是 keyword，标签筛选是 tag）
 *   POST /api/pro/community-qa/questions   body { title, content, tags[] }
 *        create: (body) => apiClient.post(`${t}/questions`, body)
 *        页面提交：{ title: 标题.trim(), content: 描述.trim(),
 *                    tags: 输入.split(/[,，]/).map(trim).filter(Boolean) }
 *   只读实测：GET /api/pro/community-qa/questions?page=1&page_size=5 → 200
 *             {"code":200,"data":{"list":[],"page":1,"page_size":5,"total":0},"message":"操作成功"}
 *             （page=abc → 400，故此处先本地校验 page 是整数）
 *
 * ⚠️ POST 是写操作：本仓库铁律禁止实测写接口，这里只做参数校验 + 转发，**未端到端实测**。
 */

/** GET：列表（status 由后端定义的三个枚举；官方前台没有状态筛选 UI，这里只为代理完整性保留） */
export async function GET(request: NextRequest) {
    const sp = request.nextUrl.searchParams;

    const pageRaw = sp.get("page");
    const page = pageRaw === null || pageRaw === "" ? 1 : Number(pageRaw);
    if (!Number.isInteger(page) || page < 1) {
        return fail(400, "page 必须是不小于 1 的整数");
    }

    const pageSizeRaw = sp.get("page_size");
    const pageSize = pageSizeRaw === null || pageSizeRaw === "" ? null : Number(pageSizeRaw);
    if (pageSize !== null && (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100)) {
        return fail(400, "page_size 必须是 1~100 的整数");
    }

    const mineRaw = sp.get("mine");
    if (mineRaw !== null && mineRaw !== "" && mineRaw !== "true" && mineRaw !== "false") {
        return fail(400, "mine 只接受 true / false");
    }
    const mine = mineRaw === "true";

    const keyword = (sp.get("keyword") ?? "").trim();
    if (keyword.length > QA_LIMITS.keyword) {
        return fail(400, `keyword 最长 ${QA_LIMITS.keyword} 个字符`);
    }

    const tag = (sp.get("tag") ?? "").trim();
    if (tag.length > QA_LIMITS.tag) {
        return fail(400, `tag 最长 ${QA_LIMITS.tag} 个字符`);
    }

    const status = (sp.get("status") ?? "").trim();
    if (status && !QA_STATUSES.has(status)) {
        return fail(400, "status 只接受 PENDING / APPROVED / REJECTED");
    }

    // 空值一律不拼：官方 apiClient 也只把有值的参数发出去，且 page_size 交给后端默认（20）
    const qs = new URLSearchParams({ page: String(page) });
    if (pageSize !== null) qs.set("page_size", String(pageSize));
    if (mine) qs.set("mine", "true");
    if (keyword) qs.set("keyword", keyword);
    if (tag) qs.set("tag", tag);
    if (status) qs.set("status", status);

    return qaProxy(
        request,
        `${QA_REMOTE_BASE}/questions?${qs.toString()}`,
        { method: "GET" },
        // mine=true 必须带登录态：不带就是「游客问自己的提问」，后端只会返回空列表而不报错，
        // 用户看到的现象是「我的提问永远为空」。所以这里本地就要求登录，给出明确提示。
        { requireLogin: mine }
    );
}

/** POST：发起提问（需要登录） */
export async function POST(request: NextRequest) {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return fail(400, "请求体格式错误");
    }

    const raw = (body ?? {}) as Record<string, unknown>;

    const title = typeof raw.title === "string" ? raw.title.trim() : "";
    if (title.length < QA_LIMITS.titleMin) {
        return fail(400, `title 至少 ${QA_LIMITS.titleMin} 个字符`);
    }
    if (title.length > QA_LIMITS.titleMax) {
        return fail(400, `title 最长 ${QA_LIMITS.titleMax} 个字符`);
    }

    const content = typeof raw.content === "string" ? raw.content.trim() : "";
    if (content.length < QA_LIMITS.contentMin) {
        return fail(400, `content 至少 ${QA_LIMITS.contentMin} 个字符`);
    }
    if (content.length > QA_LIMITS.contentMax) {
        return fail(400, `content 最长 ${QA_LIMITS.contentMax} 个字符`);
    }

    const rawTags = raw.tags;
    if (rawTags !== undefined && !Array.isArray(rawTags)) {
        return fail(400, "tags 必须是字符串数组");
    }
    const tags = (Array.isArray(rawTags) ? rawTags : [])
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean);
    if (tags.length > QA_LIMITS.tagsMax) {
        return fail(400, `tags 最多 ${QA_LIMITS.tagsMax} 个`);
    }

    return qaProxy(
        request,
        `${QA_REMOTE_BASE}/questions`,
        { method: "POST", body: JSON.stringify({ title, content, tags }) },
        { requireLogin: true }
    );
}
