import { NextRequest, NextResponse } from "next/server";

import { adminProxyFetch } from "@/lib/admin-api";
import { invalidPluginId } from "../../_lib/plugin-id";

// 插件配置保存：PUT /api/admin/plugins/:id/config → 远端 PUT /admin/plugins/:id/config。
// 源码证据：pkg/handler/plugin_admin/handler.go:166-186 UpdateConfig：
//   请求体绑定结构体只有 **一个字段 config，且类型是 map[string]string**
//   （handler.go:173-175），所以 number / boolean 也必须序列化成字符串；
//   后端会按 manifest 的 config_schema 校验必填项（registry.go:742-746），
//   保存成功后若插件正在运行会自动重载生效（registry.go:752-756）。
// 注册在 handler.go:196。成功返回 data: null、message「插件配置已保存」。
//
// ⚠️ 写操作：保存即生效（运行中插件立刻重载），前端二次确认后再调用。
type Params = Promise<{ id: string }>;

/** 把 body.config 归一化成 Record<string, string>：只接受对象，值只接受 string / number / boolean */
function normalizeConfig(input: unknown): Record<string, string> | null {
    if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
        if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
            // 后端 map value 是 string：数字与布尔统一转成字符串，与插件的解析约定一致
            out[key] = String(value);
        }
    }
    return out;
}

export async function PUT(request: NextRequest, { params }: { params: Params }) {
    const { id } = await params;
    const invalid = invalidPluginId(id);
    if (invalid) return invalid;

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ code: 400, message: "请求体格式错误", data: null }, { status: 400 });
    }

    const config = normalizeConfig((body as { config?: unknown } | null)?.config);
    if (!config) {
        return NextResponse.json(
            { code: 400, message: "请求体需为 { config: { 键: 字符串值 } }", data: null },
            { status: 400 }
        );
    }

    return adminProxyFetch(`/admin/plugins/${encodeURIComponent(id)}/config`, {
        method: "PUT",
        body: JSON.stringify({ config }),
    });
}
