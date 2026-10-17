// 社区问答（前台）同源代理的公共实现。
//
// 为什么抽一个 _proxy.ts：
//   前台问答要转发 7 条远端请求（config / 列表 / 提问 / 详情 / 作答 / 问题点赞 / 回答点赞 / 采纳），
//   它们要做的事完全一样 —— 读 httpOnly 的 token cookie、转发 UA 与客户端 IP、把后端信封原样回给浏览器。
//   抄 8 遍迟早漏一处；而漏掉 token 的表现是「已登录却一直 401 / 我的提问永远为空」，很难排查。
//   文件名以下划线开头：Next 只把 route.ts 当路由，这个文件不会被当成接口（私有约定）。
//
// 远端基址证据（线上前台 https://blog.ciraos.top/questions 实际加载的 chunk
// /_next/static/chunks/0e2bxbx8-99ke.js 模块 343577，逐字）：
//   let t = "/api/pro/community-qa"
// 所以本目录所有远端路径都以 /pro/community-qa 开头；API_URL 已含 /api 后缀，这里不能再拼 /api。
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { API_URL } from "@/lib/api";
import { clientForwardHeaders } from "@/lib/proxy-headers";
import { ACCESS_TOKEN_KEY } from "@/lib/auth";

/** 本站代理统一的错误信封（形状与后端 { code, message, data } 一致，客户端只需认一种） */
export function fail(status: number, message: string): NextResponse {
    return NextResponse.json({ code: status, message, data: null }, { status });
}

/** 远端只读路径前缀（公开基址）。管理端基址 /pro/admin/community-qa 由后台代理负责，前台不碰。 */
export const QA_REMOTE_BASE = "/pro/community-qa";

/**
 * 转发一条社区问答请求到远端。
 *
 * @param request 入站请求（取 UA / 客户端 IP 用）
 * @param path 远端路径，形如 /pro/community-qa/questions
 * @param init 方法 + 已序列化的 body
 * @param options.requireLogin 需要登录的动作（提问 / 作答 / 我的提问 / 点赞 / 采纳）置 true：
 *        没有 token 时**在本地就明确回 401**，而不是把游客请求发到远端后收到一个含糊的 401 ——
 *        前端据此能给出「请先登录」的明确提示，而不是静默失败。
 */
export async function qaProxy(
    request: NextRequest,
    path: string,
    init: { method: "GET" | "POST" | "PUT"; body?: string },
    options: { requireLogin?: boolean } = {}
): Promise<NextResponse> {
    const token = (await cookies()).get(ACCESS_TOKEN_KEY)?.value;

    if (options.requireLogin && !token) {
        return fail(401, "请先登录后再操作");
    }

    const headers = clientForwardHeaders(request);
    if (init.body !== undefined) {
        headers.set("Content-Type", "application/json");
    }
    // 有登录态就带上：列表 / 详情这类「可选登录」的接口靠它区分「我的提问」和内容归属，
    // 必需登录的接口靠它鉴权（与 src/app/api/public/comments/route.ts 同思路）。
    if (token) {
        headers.set("Authorization", `Bearer ${token}`);
    }

    let res: Response;
    try {
        res = await fetch(`${API_URL}${path}`, {
            method: init.method,
            headers,
            body: init.body,
            cache: "no-store",
        });
    } catch {
        return fail(502, "无法连接后端服务");
    }

    const text = await res.text();
    let json: unknown = null;
    try {
        json = JSON.parse(text);
    } catch {
        // 非 JSON 响应（网关 HTML、空响应等）—— 下面统一包成我们的信封
    }

    if (json !== null && typeof json === "object" && !Array.isArray(json)) {
        // 后端信封原样回传（含 code / message / data），HTTP 状态也照搬：
        // 「错误 toast 显示后端原话」这条要求就靠这一点成立 —— 不在代理层改写 message。
        return NextResponse.json(json, { status: res.status });
    }

    return fail(res.ok ? 502 : res.status, text.trim() || `请求失败（HTTP ${res.status}）`);
}

/** 审核状态枚举（线上 chunk 里 qaStatus 的三个键，逐字） */
export const QA_STATUSES = new Set(["PENDING", "APPROVED", "REJECTED"]);

/** 各字段上限全部对齐官方输入框的 maxLength（见线上 chunk 的 JSX），不自己发明限制 */
export const QA_LIMITS = {
    /** 搜索问题输入框 maxLength=150 */
    keyword: 150,
    /** 筛选标签输入框 maxLength=24 */
    tag: 24,
    /** 问题标题输入框 maxLength=150；提交按钮在 <3 个字符时禁用 */
    titleMin: 3,
    titleMax: 150,
    /** 问题描述 textarea maxLength=10000；提交按钮在 <5 个字符时禁用 */
    contentMin: 5,
    contentMax: 10000,
    /** 标签输入框 maxLength=124；页面提示「最多5个标签」 */
    tagsInputMax: 124,
    tagsMax: 5,
    /** 回答内容：官方回答框 maxLength 未取证，沿用与问题描述一致的上限并在报告里声明 */
    answerMax: 10000,
} as const;

/**
 * 校验路径里的 id：非空、长度合理、不含斜杠（斜杠会被 encodeURIComponent 转义，
 * 但那是「把非法输入发给后端」，不如在本地就挡掉）。
 */
export function badId(id: string | undefined): string | null {
    const value = (id ?? "").trim();
    if (!value) return "id 不能为空";
    if (value.length > 64) return "id 过长";
    if (value.includes("/")) return "id 不合法";
    return null;
}
