// 主题商城「写操作 + 主题配置」API（客户端调用同源代理路由 /api/admin/themes/*，不直连远端）。
//
// 本文件保留一个极小的同源 fetch 助手（fetchEnvelope：同源路径 → 解析 { code, message, data }
// 信封 → 失败抛带 status/code 的错误），与 src/lib/api-config-backup.ts 的做法一致；
// 信封类型统一用 @/lib/api 的 ApiEnvelope。
//
// 远端契约（源码证据，逐条对应 src/app/api/admin/themes/*/route.ts 的注释）：
//  - POST /theme/switch         body { theme_name }                      handler.go:250-285 / :433-435
//  - POST /theme/uninstall      body { theme_name }                      handler.go:335-365 / :437-440
//  - POST /theme/install        body { theme_name, download_url,          handler.go:194-236 / :42-46
//                                    theme_market_id? }
//  - POST /theme/upload         multipart: file, force_update="true"?     handler.go:461-514
//  - POST /theme/validate       multipart: file                           handler.go:528-556
//  - GET  /theme/settings?theme_name=…   → ThemeSettingGroup[]            handler.go:612-637
//  - GET  /theme/config?theme_name=…     → 用户已保存的裸配置（无默认值）  handler.go:651-675
//  - POST /theme/config         body { theme_name, config }               handler.go:690-715 / :595-598
//  - GET  /theme/current-config          → ThemeConfigResponse            handler.go:727-745
//
// ⚠️ 这些远端路由挂在 **JWTAuth**（不是 AdminAuth）下（router.go:758），
//    同源代理用 httpOnly token cookie 换 Bearer，浏览器端不需要也不应该持有 token。

import type {
    ThemeConfigResponse,
    ThemeConfigValues,
    ThemeSettingGroup,
    ThemeUploadResponse,
    ThemeValidationResult,
} from "@/types/themes";
import type { ApiEnvelope } from "@/lib/api";

/** 同源代理路由的统一前缀 */
const BASE = "/api/admin/themes";

/** 带 HTTP 状态与业务 code 的错误（与 @/lib/api 的 ApiError 同形状，便于统一处理） */
export class ThemeApiError extends Error {
    status: number;
    code: number;

    constructor(message: string, status: number, code: number) {
        super(message);
        this.name = "ThemeApiError";
        this.status = status;
        this.code = code;
    }
}

/**
 * 调同源代理路由并解析 { code, message, data } 信封。
 * 同源请求会自动带上 httpOnly token cookie，由 route handler 换成 Bearer 转发到远端。
 *
 * body 处理：FormData 不手动设 Content-Type（要让 fetch 自己带 multipart boundary），
 * 其余（JSON 字符串）补 application/json。
 */
async function fetchEnvelope<T>(path: string, init?: RequestInit): Promise<T> {
    const headers = new Headers(init?.headers);
    if (init?.body && !(init.body instanceof FormData) && !(init.body instanceof Blob) && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
    }

    let res: Response;
    try {
        res = await fetch(path, { ...init, headers, cache: "no-store" });
    } catch {
        throw new ThemeApiError("网络请求失败，请检查网络连接", 0, 0);
    }

    let json: ApiEnvelope<T> | null = null;
    try {
        json = (await res.json()) as ApiEnvelope<T>;
    } catch {
        // 非 JSON 响应（例如网关错误页），下面按 HTTP 状态兜底报错
    }

    if (res.ok && json && (json.code === 200 || json.code === 0)) {
        return json.data;
    }

    throw new ThemeApiError(json?.message || `请求失败（HTTP ${res.status}）`, res.status, json?.code ?? res.status);
}

/**
 * 从 downloadUrl 提取主题名（对齐只读对照 src/app/admin/themes/_hooks/use-theme-page.ts:26-33）。
 * 形如 theme-xxx-v1.0.0.zip / theme-xxx-1.0.0.tgz → theme-xxx。
 * 为什么必须从 URL 反推：后端 installer 要求 theme_name 以 "theme-" 开头（handler.go:224），
 * 而商城列表的 name 可能是「安和鱼官方主题」这样的展示名。
 */
export function extractThemeNameFromUrl(downloadUrl?: string | null): string {
    if (!downloadUrl) return "";
    const fileName = downloadUrl.split("/").pop() ?? "";
    const nameWithoutExt = fileName.replace(/\.tar\.gz$/i, "").replace(/\.tgz$/i, "").replace(/\.zip$/i, "");
    return nameWithoutExt.replace(/-v?\d+(\.\d+)*$/, "");
}

/** POST /api/admin/themes/switch —— 切换（应用）主题；主题必须已安装，会立刻改变全站外观 */
export function switchThemeApi(themeName: string): Promise<void> {
    return fetchEnvelope<void>(`${BASE}/switch`, {
        method: "POST",
        body: JSON.stringify({ theme_name: themeName }),
    });
}

/** POST /api/admin/themes/uninstall —— 卸载主题（删文件 + 删库记录，不可恢复；当前启用/官方主题后端会拒绝） */
export function uninstallThemeApi(themeName: string): Promise<void> {
    return fetchEnvelope<void>(`${BASE}/uninstall`, {
        method: "POST",
        body: JSON.stringify({ theme_name: themeName }),
    });
}

/** POST /api/admin/themes/install —— 从 download_url 下载并安装主题（theme_name 必须以 theme- 开头） */
export function installThemeApi(payload: {
    theme_name: string;
    download_url: string;
    theme_market_id?: number;
}): Promise<void> {
    return fetchEnvelope<void>(`${BASE}/install`, {
        method: "POST",
        body: JSON.stringify(payload),
    });
}

/**
 * POST /api/admin/themes/upload —— 上传 ZIP 主题包并直接安装。
 * forceUpdate=true 时带 force_update="true"（同名主题覆盖更新，后端的「强制更新」开关）。
 */
export function uploadThemeApi(file: File, forceUpdate = false): Promise<ThemeUploadResponse> {
    const formData = new FormData();
    formData.append("file", file);
    if (forceUpdate) formData.append("force_update", "true");
    return fetchEnvelope<ThemeUploadResponse>(`${BASE}/upload`, { method: "POST", body: formData });
}

/** POST /api/admin/themes/validate —— 仅校验 ZIP 主题包，不安装 */
export function validateThemeApi(file: File): Promise<ThemeValidationResult> {
    const formData = new FormData();
    formData.append("file", file);
    return fetchEnvelope<ThemeValidationResult>(`${BASE}/validate`, { method: "POST", body: formData });
}

/** GET /api/admin/themes/settings —— 主题配置字段定义（分组），用于生成配置表单 */
export function getThemeSettingsApi(themeName: string): Promise<ThemeSettingGroup[]> {
    return fetchEnvelope<ThemeSettingGroup[]>(`${BASE}/settings?theme_name=${encodeURIComponent(themeName)}`);
}

/** GET /api/admin/themes/config —— 用户对某主题已保存的裸配置（不含定义里的默认值） */
export function getUserThemeConfigApi(themeName: string): Promise<Record<string, unknown>> {
    return fetchEnvelope<Record<string, unknown>>(`${BASE}/config?theme_name=${encodeURIComponent(themeName)}`);
}

/** POST /api/admin/themes/config —— 保存主题配置（后端整体覆盖写入，故需提交全量字段） */
export function saveUserThemeConfigApi(themeName: string, config: ThemeConfigValues): Promise<void> {
    return fetchEnvelope<void>(`${BASE}/config`, {
        method: "POST",
        body: JSON.stringify({ theme_name: themeName, config }),
    });
}

/** GET /api/admin/themes/current-config —— 当前主题的完整配置（主题名 + 字段定义 + 已合并默认值的生效值） */
export function getCurrentThemeConfigApi(): Promise<ThemeConfigResponse> {
    return fetchEnvelope<ThemeConfigResponse>(`${BASE}/current-config`);
}
