import type { NextRequest } from "next/server";

import { QA_REMOTE_BASE, qaProxy } from "../_proxy";

/**
 * 社区问答 · 开关 —— 同源代理。
 *
 * 远端：GET /api/pro/community-qa/config  →  {"code":200,"data":{"enabled":true},"message":"操作成功"}
 *   路径与响应形状逐字来自线上前台 /questions 的 chunk（模块 343577）：
 *     config: () => apiClient.get(`${t}/config`)；页面读 a.data.enabled。
 *   只读实测（2026-10）：GET https://blog.ciraos.top/api/pro/community-qa/config → 200。
 *
 * 无需登录（公开接口），但若浏览器带着 token 也一并转发 —— 后端是可选登录，带上不会更差。
 */
export async function GET(request: NextRequest) {
    return qaProxy(request, `${QA_REMOTE_BASE}/config`, { method: "GET" });
}
