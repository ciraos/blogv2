// 评论导入 / 导出 API（客户端调用同源代理路由 /api/admin/comments/*，不直连远端）。
//
// 为什么不直接用 @/lib/api 里的 request：本模块的导出接口返回的是**文件流**（application/zip），
// 需要拿到原始 Response 去读 blob / Content-Disposition，而 request 只解 { code, message, data } 信封；
// 所以这里保留直接 fetch 的写法，信封类型统一用 @/lib/api 的 ApiEnvelope。
//
// 远端接口与形状（源码证据，非猜测）：
//  - internal/infra/router/router.go:279-289 管理员评论组（JWTAuth + AdminAuth）：
//      POST /comments/export（router.go:287）、POST /comments/import（router.go:288）。
//  - pkg/handler/comment/dto/dto.go:140-159 请求/响应形状：
//      ExportRequest { ids: string[] }（空数组 = 导出全部）
//      ImportResult  { total_count, success_count, skipped_count, failed_count, error_messages }
//  - pkg/handler/comment/handler.go:617-639 导出是**文件流**（不是 JSON 信封）：
//      正文是 ZIP 二进制（service 层 zip 里放 comments.json），
//      Content-Type: application/zip、Content-Disposition: attachment; filename=comments_export.zip；
//      body 解析失败（含空 body）时后端把 ids 当空数组处理，即「导出全部」。
//  - pkg/handler/comment/handler.go:657-737 导入是 multipart/form-data：
//      字段 file（必填）+ skip_existing / default_status / keep_create_time（可选）；
//      按**文件扩展名**分支（handler.go:706-718）：.json → 直接解析，.zip → 找包内 comments.json，
//      其它扩展名 → 400「不支持的文件格式，仅支持 .json 和 .zip 文件」。
//      返回 { code, message, data: ImportResult }（handler.go:727-736）。
//      注意：后端没有对上传体积做硬限制（Gin 未设 MaxMultipartMemory / MaxBytesReader，
//      文件是 io.ReadAll 全量读进内存），所以浏览器端与代理层的上限属于**本地保护**，
//      后端真会接受的更大文件我们主动不放行，避免一次打满内存。

import type { ApiEnvelope } from "@/lib/api";

/** 同源代理路由的统一前缀 */
const BASE = "/api/admin/comments";

/** 代理层与浏览器端共用的导入文件体积上限（后端无限制，见文件头注释） */
export const MAX_COMMENT_IMPORT_SIZE = 32 * 1024 * 1024;

/** 从 Content-Disposition 里取文件名（形如 `attachment; filename=comments_export.zip`） */
export function filenameFromDisposition(disposition: string | null): string | null {
    if (!disposition) return null;
    const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
}

/** 字节数 → 人类可读（提示文案用） */
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

/** 带 HTTP 状态与业务 code 的错误（与 @/lib/api 的 ApiError 同形状，便于统一处理） */
export class CommentIoApiError extends Error {
    status: number;
    code: number;

    constructor(message: string, status: number, code: number) {
        super(message);
        this.name = "CommentIoApiError";
        this.status = status;
        this.code = code;
    }
}

/** 导出结果：ZIP 文件内容 + 远端给的文件名（取不到时由调用方兜底命名） */
export interface CommentExportResult {
    blob: Blob;
    /** 下载文件名：优先用远端 Content-Disposition 里的名字 */
    filename: string | null;
}

/** 导入选项（字段名与后端 ImportComments 读的表单字段一致，handler.go:687-693） */
export interface CommentImportOptions {
    /** 跳过已存在的评论（后端按 路径+邮箱+内容 判重，service/import_export_service.go:445-462） */
    skipExisting: boolean;
    /** 保留原创建时间 */
    keepCreateTime: boolean;
    /** 默认状态（1=已发布 2=待审核；后端只接受 1/2，其它值回落为 1） */
    defaultStatus: 1 | 2;
}

/** 导入结果（字段名与后端 dto.ImportResult 完全一致） */
export interface CommentImportResult {
    total_count: number;
    success_count: number;
    skipped_count: number;
    failed_count: number;
    error_messages: string[] | null;
}

/** 判定是否为本模块认识的导入文件（后端按扩展名分支，这里保持同一口径） */
export function isSupportedCommentImportFile(name: string): boolean {
    const lower = name.toLowerCase();
    return lower.endsWith(".json") || lower.endsWith(".zip");
}

/**
 * POST /api/admin/comments/export —— 导出评论为 ZIP。
 * 走 blob 而不是信封解析：远端返回的是**文件流**（application/zip + Content-Disposition），
 * 不是 { code, message, data } 信封。失败时（未登录 / 远端 4xx-5xx）返回的才是 JSON 信封，
 * 这里尽量把后端 message 透出来。
 * @param ids 要导出的评论公共 ID；空数组表示导出全部（后端 handler.go:619-622 的语义）
 */
export async function exportAdminCommentsApi(ids: string[] = []): Promise<CommentExportResult> {
    let res: Response;
    try {
        res = await fetch(`${BASE}/export`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids }),
            cache: "no-store",
        });
    } catch {
        throw new CommentIoApiError("网络请求失败，请检查网络连接", 0, 0);
    }

    if (!res.ok) {
        let message = `导出失败（HTTP ${res.status}）`;
        try {
            const json = (await res.json()) as Partial<ApiEnvelope<unknown>>;
            if (json?.message) message = json.message;
        } catch {
            // 非 JSON 响应，保留上面的兜底文案
        }
        throw new CommentIoApiError(message, res.status, res.status);
    }

    return {
        blob: await res.blob(),
        filename: filenameFromDisposition(res.headers.get("Content-Disposition")),
    };
}

/**
 * POST /api/admin/comments/import —— 上传 JSON / ZIP 评论数据并写库（⚠️ 高危，写操作）。
 * 提交前先在浏览器端做一次与代理层相同的校验（扩展名 + 体积），省掉必然失败的往返。
 */
export async function importAdminCommentsApi(
    file: File,
    options: CommentImportOptions
): Promise<CommentImportResult> {
    if (!isSupportedCommentImportFile(file.name)) {
        throw new CommentIoApiError("只支持 .json 或 .zip 文件", 400, 400);
    }
    if (file.size > MAX_COMMENT_IMPORT_SIZE) {
        throw new CommentIoApiError(`文件大小不能超过 ${formatBytes(MAX_COMMENT_IMPORT_SIZE)}`, 400, 400);
    }

    const formData = new FormData();
    formData.append("file", file);
    // 选项必须显式带上：后端 DefaultPostForm 在字段缺失时把 skip_existing / keep_create_time
    // 都当作 true（handler.go:687-688），不传就等于「跳过已存在 + 保留时间」。
    formData.append("skip_existing", String(options.skipExisting));
    formData.append("keep_create_time", String(options.keepCreateTime));
    formData.append("default_status", String(options.defaultStatus));

    let res: Response;
    try {
        // FormData 不能手动设 Content-Type（要让 fetch 自己带 multipart boundary）
        res = await fetch(`${BASE}/import`, { method: "POST", body: formData, cache: "no-store" });
    } catch {
        throw new CommentIoApiError("网络请求失败，请检查网络连接", 0, 0);
    }

    let json: ApiEnvelope<CommentImportResult> | null = null;
    try {
        json = (await res.json()) as ApiEnvelope<CommentImportResult>;
    } catch {
        // 非 JSON 响应（例如网关错误页），下面按 HTTP 状态兜底报错
    }

    if (res.ok && json && (json.code === 200 || json.code === 0) && json.data) {
        return json.data;
    }

    throw new CommentIoApiError(
        json?.message || `导入失败（HTTP ${res.status}）`,
        res.status,
        json?.code ?? res.status
    );
}
