import { NextRequest } from "next/server";

import { adminProxyFetch } from "@/lib/admin-api";
import { invalidPluginId } from "../../_lib/plugin-id";

// 插件启用：POST /api/admin/plugins/:id/enable → 远端 POST /admin/plugins/:id/enable。
// 源码证据：pkg/handler/plugin_admin/handler.go:87 Enable（c.Param("id") → manager.EnableByID），
// 注册在 handler.go:195。**无请求体**，成功返回 data: null、message「插件已启用」。
//
// ⚠️ 写操作：会真正拉起插件进程（若插件二进制与当前平台不匹配会返回 400 错误信息），
// 前端二次确认后再调用。
type Params = Promise<{ id: string }>;

export async function POST(_request: NextRequest, { params }: { params: Params }) {
    const { id } = await params;
    const invalid = invalidPluginId(id);
    if (invalid) return invalid;
    return adminProxyFetch(`/admin/plugins/${encodeURIComponent(id)}/enable`, { method: "POST" });
}
