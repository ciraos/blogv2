// 说说（即刻）管理「批量删除 / 导出 / 导入」专用的同源 fetch 助手。
//
// 为什么另起一个文件而不是写进 src/lib/api.ts：
//   lib/api.ts 是全局公共模块（前台 / 首页 / 用户中心都在用），本文件只服务后台「说说管理」，
//   单独放可以避免为了这几个接口去动公共文件；信封类型统一用 @/lib/api 的 ApiEnvelope。
//
// 后端不开放 CORS，浏览器必须走同源 /api/admin/essays/* 代理；代理再带上 httpOnly cookie
// 里的 token 转发到远端（见 src/app/api/admin/essays/{batch,export,import}/route.ts）。
//
// 远端契约（闭源 PRO 模块：OSS 后端源码与 swagger 都不含说说接口，因此以**官方主题前端源码**
// 为准，路径已用线上只读探活核对）：
//  - POST /pro/admin/essays/batch-delete
//      官方 src/lib/api/essay.ts:201-211：body { ids: number[] }，只判 code === 200，
//      不解析 data（响应信封里的统计字段未文档化，这里也不猜）。
//  - POST /pro/admin/essays/export
//      官方 essay.ts:213-224：body { essay_ids: number[] }，axios responseType:"blob"
//      → 响应是**文件流**（ZIP），不是信封；官方下载名 essays-export-YYYY-MM-DD.zip
//      （hooks/queries/use-essays.ts:142-156），且要求至少选一条
//      （app/admin/essays/_hooks/use-essays-page.ts:130-135）。
//  - POST /pro/admin/essays/import
//      官方 essay.ts:226-245 + components/admin/essays/ImportDialog.tsx:82,89,98-99,129-139：
//      multipart/form-data，字段 file（.json 或 .zip）、skip_existing（"true"/"false"，默认 true）、
//      default_status（1=已发布 2=草稿 3=隐藏，默认 1，取值见 lib/constants/essay.ts:7-11）。
//      响应 { code, message, data: ImportEssayResult }，ImportEssayResult =
//      { total_count, success_count, skipped_count, failed_count, errors, created_ids }（essay.ts:95-102）。
//  - 线上探活（只读 GET）：/pro/admin/essays/export 与 /pro/admin/essays/batch-delete 均返回 401
//      {"code":401,"message":"请求未携带Token，无权限访问"}（同一路径组的随机路径是 404，
//      所以这两个端点确实存在，只是需要管理员登录）。
//
// ⚠️ 批量删除与导入都是**写操作**，本模块只负责调用，二次确认由调用方（essays-manager.tsx）负责。

import type { ApiEnvelope } from "@/lib/api";

/** 同源代理路由前缀 */
const BASE = "/api/admin/essays";

/** 代理层与浏览器端共用的导入文件体积上限（本地保护；后端上限未知，宁可本地先拦） */
export const MAX_ESSAY_IMPORT_SIZE = 32 * 1024 * 1024;

/** 说说状态：1=已发布 2=草稿 3=隐藏（官方 lib/constants/essay.ts:7-11） */
export type EssayImportDefaultStatus = 1 | 2 | 3;

/** 导入选项（表单字段名与官方一致：skip_existing / default_status） */
export interface EssayImportOptions {
    /** 跳过已存在的说说（官方按内容 + 创建时间匹配重复项） */
    skipExisting: boolean;
    /** 文件里没写状态时用的默认状态 */
    defaultStatus: EssayImportDefaultStatus;
}

/** 导入结果（字段名与官方 essay.ts:95-102 的 ImportEssayResult 一致） */
export interface EssayImportResult {
    total_count: number;
    success_count: number;
    skipped_count: number;
    failed_count: number;
    /** 失败明细（后端可能不回，故宽松处理） */
    errors?: string[] | null;
    /** 新建说说的 id（后端可能不回，故宽松处理） */
    created_ids?: number[] | null;
}

/** 导出结果：文件内容 + 远端给的文件名（取不到时由调用方兜底命名） */
export interface EssayExportResult {
    blob: Blob;
    /** 下载文件名：远端 Content-Disposition 里的名字，拿不到则为 null */
    filename: string | null;
}

/** 带 HTTP 状态与业务 code 的错误（与 lib/api 的 ApiError 同形状，便于统一处理） */
export class EssayIoApiError extends Error {
    status: number;
    code: number;

    constructor(message: string, status: number, code: number) {
        super(message);
        this.name = "EssayIoApiError";
        this.status = status;
        this.code = code;
    }
}

/** 从 Content-Disposition 里取文件名（兼容 filename*=UTF-8'' 与普通 filename=） */
export function filenameFromDisposition(disposition: string | null): string | null {
    if (!disposition) return null;
    const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
    if (utf8?.[1]) {
        try {
            return decodeURIComponent(utf8[1].trim());
        } catch {
            // 编码异常就继续用下面的普通 filename
        }
    }
    const plain = /filename="?([^";]+)"?/i.exec(disposition);
    return plain?.[1]?.trim() || null;
}

/** 字节数 → 人类可读（与 api-comments-io 的同名工具同实现；为保持本模块自包含这里重复一份小工具） */
export function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    let value = bytes;
    let i = 0;
    while (value >= 1024 && i < units.length - 1) {
        value /= 1024;
        i += 1;
    }
    return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/** 判定是否为本模块认识的导入文件（官方 ImportDialog.tsx:89 accept=".json,.zip"） */
export function isSupportedEssayImportFile(name: string): boolean {
    const lower = name.toLowerCase();
    return lower.endsWith(".json") || lower.endsWith(".zip");
}

/** 用浏览器下载一个 blob（导出说说用） */
export function downloadBlobFile(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // 立刻回收会让部分浏览器取消下载，交回事件循环后释放更稳
    setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** 从响应里取错误文案：代理失败时回的是 { code, message, data: null } 信封 */
async function errorMessageFrom(res: Response, fallback: string): Promise<string> {
    try {
        const json = (await res.json()) as Partial<ApiEnvelope<unknown>>;
        if (json?.message) return json.message;
    } catch {
        // 非 JSON 响应，用兜底文案
    }
    return `${fallback}（HTTP ${res.status}）`;
}

/**
 * POST /api/admin/essays/batch —— 批量删除说说（⚠️ 写操作，未实测）。
 * 远端只保证 code === 200 表示成功、失败时 message 可展示，因此这里不返回业务数据。
 * @param ids 要删除的说说 id（至少一条；官方界面同样要求先勾选）
 */
export async function batchDeleteAdminEssaysApi(ids: number[]): Promise<void> {
    if (ids.length === 0) {
        throw new EssayIoApiError("请先勾选要删除的说说", 400, 400);
    }

    let res: Response;
    try {
        res = await fetch(`${BASE}/batch`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids }),
            cache: "no-store",
        });
    } catch {
        throw new EssayIoApiError("网络请求失败，请检查网络连接", 0, 0);
    }

    let json: ApiEnvelope<unknown> | null = null;
    try {
        json = (await res.json()) as ApiEnvelope<unknown>;
    } catch {
        // 非 JSON 响应（例如网关错误页），下面按 HTTP 状态兜底报错
    }

    if (res.ok && json && json.code === 200) return;

    throw new EssayIoApiError(
        json?.message || `批量删除失败（HTTP ${res.status}）`,
        res.status,
        json?.code ?? res.status
    );
}

/**
 * POST /api/admin/essays/export —— 导出说说为 ZIP。
 * 走 blob 而不是信封解析：远端返回的是**文件流**（官方 axios responseType:"blob"），
 * 失败时（未登录 / 远端 4xx-5xx）返回的才是 JSON 信封。
 * @param essayIds 要导出的说说 id（官方要求至少一条，空数组会被代理层 400 拦下）
 */
export async function exportAdminEssaysApi(essayIds: number[]): Promise<EssayExportResult> {
    if (essayIds.length === 0) {
        throw new EssayIoApiError("请先选择要导出的说说", 400, 400);
    }

    let res: Response;
    try {
        res = await fetch(`${BASE}/export`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ essay_ids: essayIds }),
            cache: "no-store",
        });
    } catch {
        throw new EssayIoApiError("网络请求失败，请检查网络连接", 0, 0);
    }

    if (!res.ok) {
        throw new EssayIoApiError(await errorMessageFrom(res, "导出失败"), res.status, res.status);
    }

    return {
        blob: await res.blob(),
        filename: filenameFromDisposition(res.headers.get("Content-Disposition")),
    };
}

/**
 * POST /api/admin/essays/import —— 上传 JSON / ZIP 说说数据并写库（⚠️ 高危，写操作，未实测）。
 * 提交前先在浏览器端做一次与代理层同口径的校验（扩展名 + 体积），省掉必然失败的往返。
 */
export async function importAdminEssaysApi(
    file: File,
    options: EssayImportOptions
): Promise<EssayImportResult> {
    if (!isSupportedEssayImportFile(file.name)) {
        throw new EssayIoApiError("只支持 .json 或 .zip 文件", 400, 400);
    }
    if (file.size > MAX_ESSAY_IMPORT_SIZE) {
        throw new EssayIoApiError(
            `文件大小不能超过 ${formatBytes(MAX_ESSAY_IMPORT_SIZE)}`,
            400,
            400
        );
    }

    const formData = new FormData();
    formData.append("file", file);
    // 两个选项必须显式带上（官方始终显式传值，不依赖后端默认）
    formData.append("skip_existing", String(options.skipExisting));
    formData.append("default_status", String(options.defaultStatus));

    let res: Response;
    try {
        // FormData 不能手动设 Content-Type（要让 fetch 自己带 multipart boundary）
        res = await fetch(`${BASE}/import`, { method: "POST", body: formData, cache: "no-store" });
    } catch {
        throw new EssayIoApiError("网络请求失败，请检查网络连接", 0, 0);
    }

    let json: ApiEnvelope<EssayImportResult> | null = null;
    try {
        json = (await res.json()) as ApiEnvelope<EssayImportResult>;
    } catch {
        // 非 JSON 响应（例如网关错误页），下面按 HTTP 状态兜底报错
    }

    if (res.ok && json && json.code === 200 && json.data) {
        return json.data;
    }

    throw new EssayIoApiError(
        json?.message || `导入失败（HTTP ${res.status}）`,
        res.status,
        json?.code ?? res.status
    );
}
