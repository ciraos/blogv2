import { NextRequest } from "next/server";

import { adminProxyFetch } from "@/lib/admin-api";
import { invalidPluginId } from "../../_lib/plugin-id";

// 插件停用：POST /api/admin/plugins/:id/disable → 远端 POST /admin/plugins/:id/disable。
// 源码证据：pkg/handler/plugin_admin/handler.go:69 Disable（c.Param("id") → manager.DisableByID），
// 注册在 handler.go:194。**无请求体**，成功返回 data: null、message「插件已禁用」。
//
// ⚠️ 写操作：禁用状态会持久化到插件目录的 state（下次启动也不会自动加载），
// 且会停掉运行中的插件（搜索器/事件钩子立刻失效），前端二次确认后再调用。
type Params = Promise<{ id: string }>;

export async function POST(_request: NextRequest, { params }: { params: Params }) {
    const { id } = await params;
    const invalid = invalidPluginId(id);
    if (invalid) return invalid;
    return adminProxyFetch(`/admin/plugins/${encodeURIComponent(id)}/disable`, { method: "POST" });
}
