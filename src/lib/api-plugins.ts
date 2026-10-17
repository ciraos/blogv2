// 后台「插件管理」接口客户端。
//
// 请求助手统一用 @/lib/api.ts 导出的 request（不再自带副本），
// 失败时抛的就是 api.ts 的 ApiError（字段同为 message / status / code）。
//
// 所有路径都是**本站同源**代理（/api/admin/plugins/**），由 route handler 读 httpOnly
// cookie 里的 token 带上 Bearer 转发到远端 —— 后端不开放 CORS，浏览器不能直连。
//
// 权威接口定义（源码证据）：
//   cmd/server/app.go:739            → 挂载 /api/admin/plugins（JWTAuth + AdminAuth）
//   pkg/handler/plugin_admin/handler.go:189-196 → 7 条路由
//   pkg/plugin/registry.go:45-63     → 列表返回的 PluginInfo 结构
//   pkg/plugin/manifest.go:27-36     → config_schema 字段（ConfigField）

import { request } from "@/lib/api";

/** 插件运行状态（pkg/plugin/registry.go:31-36 的四个常量；留 string 兜底防后端新增状态） */
export type PluginStatus = "running" | "stopped" | "error" | "disabled" | (string & {});

/** 插件来源形态：目录式（plugin.json + 二进制）或旧式裸二进制 */
export type PluginSource = "directory" | "binary" | (string & {});

/** 配置项类型：仅这四种（manifest.go 的 validConfigFieldTypes） */
export type PluginConfigFieldType = "string" | "number" | "boolean" | "select";

/** 插件在 plugin.json 里声明的配置项（manifest.go:26-36 ConfigField） */
export interface PluginConfigField {
    /** 配置键（提交给 PUT /:id/config 时 config 的 key） */
    key: string;
    label: string;
    type: PluginConfigFieldType;
    required?: boolean;
    /** 密钥类（前端用密码框展示，不掩盖真实值 —— 列表接口会回传真实配置） */
    secret?: boolean;
    default?: string;
    description?: string;
    /** 仅 type=select 时有效 */
    options?: string[];
}

/** 插件元信息（pkg/plugin/plugin.go:22-33 Metadata） */
export interface PluginMetadata {
    id: string;
    name: string;
    version: string;
    description: string;
    author: string;
    /** 兼容保留的展示字段（如 "search"） */
    type?: string;
    /** 能力类型列表，如 ["searcher", "eventhook"] */
    types?: string[];
    homepage?: string;
}

/** 列表接口返回的单个插件（pkg/plugin/registry.go:45-63 PluginInfo） */
export interface AdminPlugin {
    metadata: PluginMetadata;
    status: PluginStatus;
    /** 目录式插件为插件目录名，裸二进制为文件名（字段名是 file_name） */
    file_name: string;
    /** 后端 json:"-"，不会下发（服务器路径） */
    source: PluginSource;
    /** 运行时实际可用的能力（Dispense 成功的类型） */
    capabilities?: string[];
    /** 事件钩子插件的订阅列表 */
    subscriptions?: string[];
    /** 仅目录式插件（manifest 有声明）才有；缺失/为空数组时前端退化为 JSON 编辑 */
    config_schema?: PluginConfigField[];
    /** 当前配置值（列表接口会填充） */
    config?: Record<string, string>;
    /** 加载失败时的错误信息 */
    error?: string;
    /** ISO 时间字符串（Go time.Time） */
    loaded_at?: string;
}

/** 后端把列表包在一层 { list, total } 里时的形状（handler 目前直接返回数组，这里做兼容） */
interface PluginListShape {
    list?: AdminPlugin[];
    total?: number;
}

/**
 * GET /api/admin/plugins → 远端 GET /admin/plugins（handler.go:39 List）
 * 成功时 data 是 PluginInfo[]（插件系统未初始化时是空数组 + 提示 message）。
 * 兼容 data 为 { list } 的写法，避免后端以后改形状时整页报错。
 */
export async function getAdminPluginsApi(): Promise<AdminPlugin[]> {
    const data = await request<AdminPlugin[] | PluginListShape | null>("/api/admin/plugins", {
        method: "GET",
    });
    if (Array.isArray(data)) return data;
    return data?.list ?? [];
}

/**
 * POST /api/admin/plugins/install → 远端 POST /admin/plugins/install（handler.go:105 Install）
 * 后端是 **multipart 文件上传**：字段名固定为 `file`，只接受 .zip，上限 100MB；
 * 不是传 URL / 插件名（handler.go:112 `c.FormFile("file")`、117 扩展名校验、23 大小上限）。
 * 成功返回安装后的 PluginInfo。
 */
export async function installAdminPluginApi(file: File): Promise<AdminPlugin | null> {
    const form = new FormData();
    form.append("file", file);
    return request<AdminPlugin | null>("/api/admin/plugins/install", {
        method: "POST",
        body: form,
    });
}

/** DELETE /api/admin/plugins/:id → 远端 DELETE /admin/plugins/:id（handler.go:148 Uninstall），data 为 null */
export async function uninstallAdminPluginApi(id: string): Promise<void> {
    await request<null>(`/api/admin/plugins/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/** POST /api/admin/plugins/:id/reload → 远端（handler.go:51 Reload），无请求体 */
export async function reloadAdminPluginApi(id: string): Promise<void> {
    await request<null>(`/api/admin/plugins/${encodeURIComponent(id)}/reload`, { method: "POST" });
}

/** POST /api/admin/plugins/:id/disable → 远端（handler.go:69 Disable），无请求体 */
export async function disableAdminPluginApi(id: string): Promise<void> {
    await request<null>(`/api/admin/plugins/${encodeURIComponent(id)}/disable`, { method: "POST" });
}

/** POST /api/admin/plugins/:id/enable → 远端（handler.go:87 Enable），无请求体 */
export async function enableAdminPluginApi(id: string): Promise<void> {
    await request<null>(`/api/admin/plugins/${encodeURIComponent(id)}/enable`, { method: "POST" });
}

/**
 * PUT /api/admin/plugins/:id/config → 远端（handler.go:166 UpdateConfig）
 * 请求体固定为 { config: { [key]: string } } —— 后端绑定的结构体只有一个 config 字段，
 * 且 map 的 value 是 string（number/boolean 也要序列化成字符串，见 handler.go:173-175）。
 */
export async function updateAdminPluginConfigApi(
    id: string,
    config: Record<string, string>
): Promise<void> {
    await request<null>(`/api/admin/plugins/${encodeURIComponent(id)}/config`, {
        method: "PUT",
        body: JSON.stringify({ config }),
    });
}

/** 运行状态 → 中文徽章文案与配色（深浅色都可读） */
export const PLUGIN_STATUS_META: Record<string, { label: string; cls: string; dot: string }> = {
    running: {
        label: "运行中",
        cls: "bg-green-500/15 text-green-600 dark:text-green-400",
        dot: "bg-green-500",
    },
    disabled: { label: "已停用", cls: "bg-muted text-muted-foreground", dot: "bg-muted-foreground/60" },
    stopped: {
        label: "已停止",
        cls: "bg-slate-500/15 text-slate-600 dark:text-slate-300",
        dot: "bg-slate-500",
    },
    error: {
        label: "加载失败",
        cls: "bg-red-500/15 text-red-600 dark:text-red-400",
        dot: "bg-red-500",
    },
};

/** 未知状态的兜底徽章 */
export function pluginStatusMeta(status: string): { label: string; cls: string; dot: string } {
    return (
        PLUGIN_STATUS_META[status] ?? {
            label: status || "未知",
            cls: "bg-muted text-muted-foreground",
            dot: "bg-muted-foreground/60",
        }
    );
}

/** 是否处于「已停用」——只有这个状态才允许点「启用」，其余状态允许「停用」 */
export function isPluginDisabled(status: string): boolean {
    return status === "disabled";
}
