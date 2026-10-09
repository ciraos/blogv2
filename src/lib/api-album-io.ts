// 相册管理 · 文件导入 / 导出（自带 fetch 助手，不动 src/lib/api.ts）
//
// 远端契约（scripts/anheyu/anheyu-app-main）：
//  - POST /albums/import（router.go:436-437，需管理员）multipart/form-data：
//      file（必填，.json / .zip）、skip_existing、overwrite_existing、default_category_id
//      → { code, message, data: { total_count, success_count, skipped_count,
//        failed_count, created_ids, errors? } }（pkg/handler/album/handler.go:520-601）
//  - POST /albums/export（router.go:436-437，需管理员）JSON：
//      { album_ids?: number[], format?: "json" | "zip" }
//      → 文件流（zip 是二进制；json 是裸导出结构 + attachment 头），
//        没有 { code, message, data } 外壳（pkg/handler/album/handler.go:430-503）
//
// 浏览器端一律走同源代理：/api/admin/albums/import、/api/admin/albums/export。
// 导出走的是文件流代理，所以这里用 fetch 直接拿 blob，不解析 JSON 外壳。
import { ApiError } from "@/lib/api";

/** 导出格式（远端 handler.go:470,486 只认这两种，缺省 json） */
export type AdminAlbumExportFormat = "json" | "zip";

/** POST /api/admin/albums/import 的返回 data */
export interface AdminAlbumFileImportResult {
    total_count: number;
    success_count: number;
    skipped_count: number;
    failed_count: number;
    /** 新建相册的库内 ID（数字，不是公共 ID） */
    created_ids: number[] | null;
    /** 逐条失败原因（后端给了才有） */
    errors?: string[];
}

/** 文件导入的选项：两个 bool 始终显式传（远端 DefaultPostForm 也有默认值，但显式更清楚） */
export interface AdminAlbumFileImportInput {
    file: File;
    /** 跳过已存在（默认 true） */
    skipExisting: boolean;
    /** 覆盖已存在（默认 false） */
    overwriteExisting: boolean;
    /** 默认分类 ID（无分类的相册归到这里；null = 不设置） */
    defaultCategoryId: number | null;
}

/** 从 Content-Disposition 里取文件名（兼容 filename*=UTF-8''xxx 与裸 filename=xxx） */
function filenameFromDisposition(disposition: string | null): string {
    if (!disposition) return "";
    const star = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(disposition);
    if (star?.[1]) {
        try {
            return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ""));
        } catch {
            return star[1].trim().replace(/^"|"$/g, "");
        }
    }
    const plain = /filename="?([^";]+)"?/i.exec(disposition);
    return plain?.[1]?.trim() ?? "";
}

/**
 * POST /api/admin/albums/import 上传相册数据文件（同源代理 → 远端 POST /albums/import）。
 * ⚠️ 会写相册表：调用方必须先做二次确认。
 */
export async function importAdminAlbumsFileApi(
    input: AdminAlbumFileImportInput
): Promise<AdminAlbumFileImportResult> {
    const form = new FormData();
    form.append("file", input.file);
    form.append("skip_existing", input.skipExisting ? "true" : "false");
    form.append("overwrite_existing", input.overwriteExisting ? "true" : "false");
    if (input.defaultCategoryId !== null) {
        form.append("default_category_id", String(input.defaultCategoryId));
    }

    let res: Response;
    try {
        // FormData 交给 fetch 自动带 boundary，不能手动设 Content-Type
        res = await fetch("/api/admin/albums/import", { method: "POST", body: form, cache: "no-store" });
    } catch {
        throw new ApiError("网络请求失败，请检查网络连接", 0, 0);
    }

    const text = await res.text();
    let json: { code?: number; message?: string; data?: AdminAlbumFileImportResult } | null = null;
    try {
        json = JSON.parse(text) as { code?: number; message?: string; data?: AdminAlbumFileImportResult };
    } catch {
        // 非 JSON 响应
    }

    if (res.ok && json?.data && (json.code === 200 || json.code === 0)) {
        return json.data;
    }
    throw new ApiError(
        json?.message || text || `导入相册失败（HTTP ${res.status}）`,
        res.status,
        json?.code ?? res.status
    );
}

/**
 * POST /api/admin/albums/export 导出相册（同源代理原样透传文件流）。
 * albumIds 为空数组 = 导出全部（远端 handler.go:441-462）。
 * 返回 blob + 远端给的下载文件名（拿不到时由调用方兜底命名）。
 */
export async function exportAdminAlbumsApi(input: {
    albumIds: number[];
    format: AdminAlbumExportFormat;
}): Promise<{ blob: Blob; filename: string }> {
    let res: Response;
    try {
        res = await fetch("/api/admin/albums/export", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ album_ids: input.albumIds, format: input.format }),
            cache: "no-store",
        });
    } catch {
        throw new ApiError("网络请求失败，请检查网络连接", 0, 0);
    }

    if (!res.ok) {
        // 失败时同源代理回的是 JSON 信封（未登录 / 远端 4xx、5xx）
        const text = await res.text();
        let message = "";
        try {
            message = (JSON.parse(text) as { message?: string }).message ?? "";
        } catch {
            // 非 JSON 错误页
        }
        throw new ApiError(message || text || `导出相册失败（HTTP ${res.status}）`, res.status, res.status);
    }

    const blob = await res.blob();
    return { blob, filename: filenameFromDisposition(res.headers.get("Content-Disposition")) };
}
