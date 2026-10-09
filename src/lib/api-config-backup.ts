// 配置备份与迁移 API（客户端调用同源代理路由 /api/admin/config/*，不直连远端）。
//
// 为什么不复用 @/lib/api 里的 request：它是模块私有函数（未导出），而本文件按任务约定
// 只能新增、不能改动 src/lib/api.ts，所以这里自带一个同样口径的小 fetch 助手
// （同源路径 → 解析 { code, message, data } 信封 → 失败抛 ApiError 风格错误）。
//
// 远端接口与形状（源码证据，非猜测）：
//  - internal/infra/router/router.go:877-903 注册了 7 条路由（全部需 JWTAuth + AdminAuth）：
//      GET  /config/backup/list     POST /config/backup/create
//      POST /config/backup/restore  POST /config/backup/delete
//      POST /config/backup/clean    GET  /config/export    POST /config/import
//  - pkg/handler/config/handler.go:30-48 请求体：
//      create  { description?: string, is_auto?: boolean }（空 description 后端兜底「手动备份」）
//      restore { filename }（required）
//      delete  { filename }（required）
//      clean   { keep_count }（required, min=1；>100 返回 400）
//  - pkg/service/config/backup_service.go:22-28 列表项 BackupInfo：
//      { filename, size(字节), created_at(RFC3339), description, is_auto }
//  - pkg/handler/config/import_export_handler.go:48-63 导出是**文件流**（不是 JSON 信封）：
//      Content-Disposition: attachment; filename=anheyu-settings.json、
//      X-Exported-Keys-Count: 导出条目数；正文是配置 JSON（MarshalIndent）。
//  - import_export_handler.go:79-94 导入是 multipart/form-data，字段名 file，
//      文件名必须以 .json 结尾，且 ≤10MB。

/** 备份元数据（字段名与后端 BackupInfo 完全一致） */
export interface ConfigBackupInfo {
    /** 备份文件名（也是 restore / delete 的定位参数） */
    filename: string;
    /** 文件大小（字节） */
    size: number;
    /** 创建时间（RFC3339） */
    created_at: string;
    /** 备份描述 */
    description: string;
    /** 是否自动备份（列表里打「自动」标签） */
    is_auto: boolean;
}

export interface ConfigExportResult {
    /** 配置 JSON 文件内容 */
    blob: Blob;
    /** 下载文件名：优先用远端 Content-Disposition 里的名字 */
    filename: string;
    /** 导出条目数（远端 X-Exported-Keys-Count；取不到时为 null，前端回落到本地统计） */
    keysCount: number | null;
}

/** 同源代理路由的统一前缀 */
const BASE = "/api/admin/config";

interface ApiEnvelope<T> {
    code: number;
    message: string;
    data: T;
}

/** 带 HTTP 状态与业务 code 的错误（与 @/lib/api 的 ApiError 同形状，便于统一处理） */
export class ConfigBackupApiError extends Error {
    status: number;
    code: number;

    constructor(message: string, status: number, code: number) {
        super(message);
        this.name = "ConfigBackupApiError";
        this.status = status;
        this.code = code;
    }
}

/**
 * 调同源代理路由并解析 { code, message, data } 信封。
 * 同源请求会自动带上 httpOnly token cookie，由 route handler 换成 Bearer 转发到远端。
 */
async function fetchEnvelope<T>(path: string, init?: RequestInit): Promise<T> {
    const headers = new Headers(init?.headers);
    // FormData 不能手动设 Content-Type（要让 fetch 自己带 multipart boundary）
    if (init?.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
    }

    let res: Response;
    try {
        res = await fetch(path, { ...init, headers, cache: "no-store" });
    } catch {
        throw new ConfigBackupApiError("网络请求失败，请检查网络连接", 0, 0);
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

    throw new ConfigBackupApiError(
        json?.message || `请求失败（HTTP ${res.status}）`,
        res.status,
        json?.code ?? res.status
    );
}

/** GET /api/admin/config/backup/list —— 备份列表（远端 data 为数组，无分页） */
export function listConfigBackupsApi(): Promise<ConfigBackupInfo[]> {
    return fetchEnvelope<ConfigBackupInfo[]>(`${BASE}/backup/list`);
}

/**
 * POST /api/admin/config/backup/create —— 创建备份。
 * description 留空时后端会用默认描述「手动备份」；is_auto 由后端职责决定（手动创建不传）。
 */
export function createConfigBackupApi(description: string): Promise<ConfigBackupInfo> {
    return fetchEnvelope<ConfigBackupInfo>(`${BASE}/backup/create`, {
        method: "POST",
        body: JSON.stringify({ description }),
    });
}

/**
 * POST /api/admin/config/backup/restore —— 用备份覆盖当前配置（⚠️ 高危）。
 * 后端在恢复前会自动把「当前配置」另存一份备份，但覆盖本身不可撤销。
 */
export function restoreConfigBackupApi(filename: string): Promise<void> {
    return fetchEnvelope<void>(`${BASE}/backup/restore`, {
        method: "POST",
        body: JSON.stringify({ filename }),
    });
}

/** POST /api/admin/config/backup/delete —— 删除指定备份文件（⚠️ 不可恢复） */
export function deleteConfigBackupApi(filename: string): Promise<void> {
    return fetchEnvelope<void>(`${BASE}/backup/delete`, {
        method: "POST",
        body: JSON.stringify({ filename }),
    });
}

/** POST /api/admin/config/backup/clean —— 只保留最新 keepCount 个备份（后端限制 1~100） */
export function cleanConfigBackupsApi(keepCount: number): Promise<void> {
    return fetchEnvelope<void>(`${BASE}/backup/clean`, {
        method: "POST",
        body: JSON.stringify({ keep_count: keepCount }),
    });
}

/**
 * POST /api/admin/config/import —— 上传 JSON 配置文件并写入数据库（⚠️ 高危）。
 * 远端要求 file 字段、文件名 .json 结尾、≤10MB；浏览器端先做一次同样的前置校验，
 * 省掉一次必然失败的往返。
 */
export function importConfigApi(file: File): Promise<void> {
    const formData = new FormData();
    formData.append("file", file);
    return fetchEnvelope<void>(`${BASE}/import`, { method: "POST", body: formData });
}

/** 从 Content-Disposition 里取文件名（形如 `attachment; filename=anheyu-settings.json`） */
function filenameFromDisposition(disposition: string | null): string | null {
    if (!disposition) return null;
    const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
}

/**
 * GET /api/admin/config/export —— 导出配置数据。
 * 走 blob 而不是 fetchEnvelope：远端返回的是**文件流**（raw JSON + Content-Disposition），
 * 不是 { code, message, data } 信封；同时读回导出条目数用于提示。
 */
export async function exportConfigApi(): Promise<ConfigExportResult> {
    let res: Response;
    try {
        res = await fetch(`${BASE}/export`, { cache: "no-store" });
    } catch {
        throw new ConfigBackupApiError("网络请求失败，请检查网络连接", 0, 0);
    }

    if (!res.ok) {
        // 失败时远端（经代理）返回的是 JSON 信封，尽量把后端 message 透出来
        let message = `导出失败（HTTP ${res.status}）`;
        try {
            const json = (await res.json()) as Partial<ApiEnvelope<unknown>>;
            if (json?.message) message = json.message;
        } catch {
            // 保留上面的兜底文案
        }
        throw new ConfigBackupApiError(message, res.status, res.status);
    }

    const blob = await res.blob();
    const rawCount = res.headers.get("X-Exported-Keys-Count");
    const keysCount = rawCount !== null && rawCount !== "" ? Number(rawCount) : null;

    return {
        blob,
        filename: filenameFromDisposition(res.headers.get("Content-Disposition")) ?? "anheyu-settings.json",
        keysCount: keysCount !== null && Number.isFinite(keysCount) ? keysCount : null,
    };
}
