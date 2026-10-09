import { NextRequest } from "next/server";
import { adminProxyFetch } from "@/lib/admin-api";

// 存储策略列表：GET 转发到远端 /policies（需登录）。
// 后端不开放 CORS 且需鉴权，浏览器端不能直连，由本路由读取 httpOnly cookie 中的 token 转发。
// ⚠️ 路径修正（2026-10 实测）：线上真实路由是 /api/policies（社区版 router.go:528），
//    旧 swagger 里的 /api/storage-policies 线上返回 404 —— 原先转发到它会取不到任何数据。
// 响应形状 { list, total }（无分页）；本轮只做列表查询，增删改后续再补。
export async function GET(request: NextRequest) {
    const qs = request.nextUrl.searchParams.toString();
    return adminProxyFetch(`/policies${qs ? `?${qs}` : ""}`, { method: "GET" });
}
