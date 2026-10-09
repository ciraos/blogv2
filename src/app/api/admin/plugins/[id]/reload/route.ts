import { NextRequest } from "next/server";

import { adminProxyFetch } from "@/lib/admin-api";
import { invalidPluginId } from "../../_lib/plugin-id";

// 插件重载：POST /api/admin/plugins/:id/reload → 远端 POST /admin/plugins/:id/reload。
// 源码证据：pkg/handler/plugin_admin/handler.go:51 Reload（c.Param("id") → manager.ReloadByID），
// 注册在 handler.go:193。**无请求体**，成功返回 data: null、message「插件已重新加载」。
//
// ⚠️ 写操作：会让插件进程重启（它提供的搜索器 / 事件钩子会短暂不可用），前端二次确认后再调用。
type Params = Promise<{ id: string }>;

export async function POST(_request: NextRequest, { params }: { params: Params }) {
    const { id } = await params;
    const invalid = invalidPluginId(id);
    if (invalid) return invalid;
    return adminProxyFetch(`/admin/plugins/${encodeURIComponent(id)}/reload`, { method: "POST" });
}
