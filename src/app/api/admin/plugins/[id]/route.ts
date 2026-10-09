import { NextRequest } from "next/server";

import { adminProxyFetch } from "@/lib/admin-api";
import { invalidPluginId } from "../_lib/plugin-id";

// 插件卸载：DELETE /api/admin/plugins/:id → 远端 DELETE /admin/plugins/:id。
// 源码证据：pkg/handler/plugin_admin/handler.go:148 Uninstall（c.Param("id") → manager.UninstallByID），
// 路由注册在 handler.go:192（group.DELETE("/:id")）。成功返回 data: null、message「插件已卸载」。
//
// ⚠️ 写操作：后端会停掉插件进程、删除插件目录（os.RemoveAll）、清理持久化状态，**不可撤销**。
// 前端必须二次确认后才调用（见 src/components/admin/plugins-manager.tsx 的卸载确认弹窗）。
type Params = Promise<{ id: string }>;

export async function DELETE(_request: NextRequest, { params }: { params: Params }) {
    const { id } = await params;
    const invalid = invalidPluginId(id);
    if (invalid) return invalid;
    return adminProxyFetch(`/admin/plugins/${encodeURIComponent(id)}`, { method: "DELETE" });
}
