// 打赏管理「导出 / 导入」专用的同源 fetch 助手。
//
// 为什么另起一个文件而不是写进 src/lib/api.ts：
//   lib/api.ts 是全局公共模块（前台 / 首页 / 用户中心都在用），本文件只服务后台「打赏管理」，
//   单独放可以避免为了这两个接口去动公共文件（该文件本次任务禁止改动）。
//
// 后端不开放 CORS，浏览器必须走同源 /api/admin/donations/* 代理；代理再带上 httpOnly cookie
// 里的 token 转发到远端（见 src/app/api/admin/donations/{export,import}/route.ts）。
//
// 远端契约（闭源 PRO 模块：OSS 后端源码与 swagger 都不含打赏接口，因此以**官方主题前端源码**
// 为准，路径已用线上只读探活核对）：
//  - GET /pro/admin/donations/export
//      官方 src/lib/api/donation.ts:52-61：查询参数 ids=1,2,3（可选，缺省 = 导出全部），
//      axios responseType:"blob" → 响应是**文件流**，不是 { code, message, data } 信封；
//      官方下载文件名是 donations-YYYY-MM-DD.json（app/admin/donations/_hooks/use-donations-page.ts:215-227）。
//  - POST /pro/admin/donations/import
//      官方 donation.ts:63-74 + app/admin/donations/_components/DonationImportDialog.tsx:41-85,155-189：
//      multipart/form-data，字段 file（JSON 文件；校验通过 { donations: [...] } 或裸数组 [...]，
//      裸数组官方会就地包成 { version, count, donations }）、skip_existing（"true"/"false"，默认 true）、
//      default_status（0=保持原状态 1=统一设为显示 2=统一设为隐藏，默认 0）；
//      响应是 { code, message, data: ImportDonationResult } 信封（use-donations-page.ts:229-251），
//      ImportDonationResult = { total_count, success_count, skipped_count, failed_count, errors? }
//      （官方 src/types/donation.ts:52-63）。
//  - 线上探活（只读 GET）：https://blog.ciraos.top/api/pro/admin/donations/export → 401
//      {"code":401,"message":"请求未携带Token，无权限访问"}，说明该端点存在且需管理员登录。
//
// ⚠️ 导入是写库操作，本模块只负责调用，二次确认由调用方（donations-manager.tsx）负责。

/** 同源代理路由前缀 */
const BASE = "/api/admin/donations";

/** 远端统一响应信封 { code, message, data } */
interface ApiEnvelope<T> {
    code: number;
    message: string;
    data: T;
}

/** 代理层与浏览器端共用的导入文件体积上限（本地保护；后端上限未知，宁可本地先拦） */
export const MAX_DONATION_IMPORT_SIZE = 10 * 1024 * 1024;

/** 默认状态策略：0=保持原状态 1=统一设为显示 2=统一设为隐藏（官方 DonationImportDialog.tsx:178-189） */
export type DonationImportDefaultStatus = 0 | 1 | 2;

/** 导入选项（表单字段名与官方一致：skip_existing / default_status） */
export interface DonationImportOptions {
    /** 跳过已存在的记录 */
    skipExisting: boolean;
    /** 文件里没写状态时用的默认状态 */
    defaultStatus: DonationImportDefaultStatus;
}

/** 导入结果（字段名与官方 types/donation.ts:57-63 的 ImportDonationResult 一致） */
export interface DonationImportResult {
    total_count: number;
    success_count: number;
    skipped_count: number;
    failed_count: number;
    /** 失败明细（官方类型里是可选字段，后端可能不回） */
    errors?: string[] | null;
}

/** 导出结果：文件内容 + 远端给的文件名（取不到时由调用方兜底命名） */
export interface DonationExportResult {
    blob: Blob;
    /** 下载文件名：远端 Content-Disposition 里的名字，拿不到则为 null */
    filename: string | null;
}

/** 带 HTTP 状态与业务 code 的错误（与 lib/api 的 ApiError 同形状，便于统一处理） */
export class DonationIoApiError extends Error {
    status: number;
    code: number;

    constructor(message: string, status: number, code: number) {
        super(message);
        this.name = "DonationIoApiError";
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

/** 判定是否为本模块认识的导入文件（官方对话框 accept=".json,.txt"，DonationImportDialog.tsx:164） */
export function isSupportedDonationImportFile(name: string): boolean {
    const lower = name.toLowerCase();
    return lower.endsWith(".json") || lower.endsWith(".txt");
}

/** 用浏览器下载一个 blob（导出打赏记录用） */
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
 * GET /api/admin/donations/export —— 导出打赏记录。
 * 走 blob 而不是信封解析：远端返回的是**文件流**（官方 axios responseType:"blob"），
 * 不是 { code, message, data } 信封；失败时（未登录 / 远端 4xx-5xx）返回的才是 JSON 信封。
 * @param ids 要导出的打赏 id；空数组表示导出全部（官方 exportDonations 不传 ids 即全部）
 */
export async function exportAdminDonationsApi(ids: number[] = []): Promise<DonationExportResult> {
    const query = ids.length > 0 ? `?ids=${ids.join(",")}` : "";

    let res: Response;
    try {
        res = await fetch(`${BASE}/export${query}`, { method: "GET", cache: "no-store" });
    } catch {
        throw new DonationIoApiError("网络请求失败，请检查网络连接", 0, 0);
    }

    if (!res.ok) {
        throw new DonationIoApiError(await errorMessageFrom(res, "导出失败"), res.status, res.status);
    }

    return {
        blob: await res.blob(),
        filename: filenameFromDisposition(res.headers.get("Content-Disposition")),
    };
}

/**
 * 读取并校正导入文件（对齐官方 DonationImportDialog.tsx:41-85）：
 *  - 必须是合法 JSON，且形如 { donations: [...] } 或裸数组 [...]；
 *  - 每条记录必须有 name（字符串）与 amount（数字；官方只认 number，这里额外容忍数字字符串，
 *    比官方更宽松，不会拒绝官方能接受的文件）；
 *  - 裸数组 / amount 是字符串时，重写为 { version, count, donations } 的 File（官方同做法）。
 */
async function normalizeDonationImportFile(file: File): Promise<File> {
    let text: string;
    try {
        text = await file.text();
    } catch {
        throw new DonationIoApiError("文件读取失败，请重新选择", 400, 400);
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        throw new DonationIoApiError("文件不是有效的 JSON 格式", 400, 400);
    }

    let rawList: unknown[];
    if (Array.isArray(parsed)) {
        rawList = parsed;
    } else if (
        parsed !== null &&
        typeof parsed === "object" &&
        Array.isArray((parsed as Record<string, unknown>).donations)
    ) {
        rawList = (parsed as Record<string, unknown>).donations as unknown[];
    } else {
        throw new DonationIoApiError("JSON 结构不正确，需要 { donations: [...] } 或 [...]", 400, 400);
    }

    if (rawList.length === 0) {
        throw new DonationIoApiError("导入数据为空，donations 数组中没有记录", 400, 400);
    }

    let needRewrite = Array.isArray(parsed);
    const donations = rawList.map((item, index) => {
        const entry = (item ?? {}) as Record<string, unknown>;
        const name = entry.name;
        if (typeof name !== "string" || name.trim() === "") {
            throw new DonationIoApiError(`第 ${index + 1} 条记录缺少有效的 name 字段`, 400, 400);
        }
        const amount = entry.amount;
        if (typeof amount === "number" && Number.isFinite(amount)) return entry;
        if (typeof amount === "string" && amount.trim() !== "" && Number.isFinite(Number(amount))) {
            // 数字字符串：官方会直接判失败，这里转成数字后重写文件，避免必然失败的往返
            needRewrite = true;
            return { ...entry, amount: Number(amount) };
        }
        throw new DonationIoApiError(`第 ${index + 1} 条记录缺少有效的 amount 字段`, 400, 400);
    });

    if (!needRewrite) return file;

    const wrapped = JSON.stringify({ version: "1.0", count: donations.length, donations });
    return new File([wrapped], file.name, { type: "application/json" });
}

/**
 * POST /api/admin/donations/import —— 上传 JSON 打赏数据并写库（⚠️ 高危，写操作，未实测）。
 * 提交前先在浏览器端做一次与代理层同口径的校验（扩展名 + 体积 + JSON 结构），省掉必然失败的往返。
 */
export async function importAdminDonationsApi(
    file: File,
    options: DonationImportOptions
): Promise<DonationImportResult> {
    if (!isSupportedDonationImportFile(file.name)) {
        throw new DonationIoApiError("只支持 .json（或 .txt）文件", 400, 400);
    }
    if (file.size > MAX_DONATION_IMPORT_SIZE) {
        throw new DonationIoApiError(
            `文件大小不能超过 ${formatBytes(MAX_DONATION_IMPORT_SIZE)}`,
            400,
            400
        );
    }

    const normalized = await normalizeDonationImportFile(file);

    const formData = new FormData();
    formData.append("file", normalized);
    // 两个选项必须显式带上（官方始终显式传值，不依赖后端默认）
    formData.append("skip_existing", String(options.skipExisting));
    formData.append("default_status", String(options.defaultStatus));

    let res: Response;
    try {
        // FormData 不能手动设 Content-Type（要让 fetch 自己带 multipart boundary）
        res = await fetch(`${BASE}/import`, { method: "POST", body: formData, cache: "no-store" });
    } catch {
        throw new DonationIoApiError("网络请求失败，请检查网络连接", 0, 0);
    }

    let json: ApiEnvelope<DonationImportResult> | null = null;
    try {
        json = (await res.json()) as ApiEnvelope<DonationImportResult>;
    } catch {
        // 非 JSON 响应（例如网关错误页），下面按 HTTP 状态兜底报错
    }

    if (res.ok && json && json.code === 200 && json.data) {
        return json.data;
    }

    throw new DonationIoApiError(
        json?.message || `导入失败（HTTP ${res.status}）`,
        res.status,
        json?.code ?? res.status
    );
}
