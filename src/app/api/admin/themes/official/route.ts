import { NextRequest } from "next/server";
import { adminProxyFetch } from "@/lib/admin-api";

// 官方主题（主题商城）列表：GET 转发到远端 /public/theme/market。
// ⚠️ 路径与语义修正（2026-10 实测）：
//   · 旧实现转发 /theme/official 且用 GET —— 但后端 /api/theme/official 是 **POST**（"切换到官方主题"这个动作），
//     GET 打它必然 404，之前因此误判成"后端尚未提供该路由"；
//   · 官方主题列表的真实接口是公开的 GET /api/public/theme/market（实测 200，返回 { list, total }，
//     字段与我们主题页需要的 name/author/description/previewUrl/themeType/deployType/isOfficial 完全对得上）。
// 后端不开放 CORS，浏览器端不能直连，由本路由转发。
export async function GET(request: NextRequest) {
    const qs = request.nextUrl.searchParams.toString();
    return adminProxyFetch(`/public/theme/market${qs ? `?${qs}` : ""}`, { method: "GET" });
}
