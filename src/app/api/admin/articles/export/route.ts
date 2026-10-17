import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { API_URL } from "@/lib/api";
import { ACCESS_TOKEN_KEY } from "@/lib/auth";

// 文章导出：POST /api/admin/articles/export → 远端 POST /articles/export。
//
// 远端接口（router.go:376 → pkg/handler/article/handler.go:748-792）：
//   请求体 JSON { article_ids: string[] }（binding:"required"，空数组另行 400）；
//   响应不是 { code, message, data } 信封，而是 application/zip 文件流 + Content-Disposition
//   （文件名 articles_export_YYYYmmdd_HHMMSS.zip）+ Content-Length。
//
// ⚠️ 所以这里刻意不用 adminProxyFetch：那个助手会把响应体读成文本再 JSON.parse，
//    ZIP 会被读坏、Content-Disposition 也会丢。做法与 /api/admin/config/export 一致：手动透传。
// 失败时（未登录 / 参数非法 / 远端 5xx）远端返回 JSON 信封，这里解出 message 交给前端提示。
const EXPORT_MAX_IDS = 1000;

/** 校验请求体：必须是 { article_ids: string[] }，非空、无空项、不超过上限 */
function parseArticleIds(raw: unknown): { ids: string[] } | { error: string } {
    if (typeof raw !== "object" || raw === null) return { error: "请求体必须是 JSON 对象" };
    const ids = (raw as { article_ids?: unknown }).article_ids;
    if (!Array.isArray(ids)) return { error: "缺少 article_ids 字段（字符串数组）" };
    if (ids.length === 0) return { error: "article_ids 不能为空" };
    if (ids.length > EXPORT_MAX_IDS) return { error: `单次最多导出 ${EXPORT_MAX_IDS} 篇文章` };
    for (const id of ids) {
        if (typeof id !== "string" || id.trim() === "") {
            return { error: "article_ids 只能是非空字符串（文章公共 ID）" };
        }
    }
    return { ids: ids as string[] };
}

export async function POST(request: NextRequest) {
    let raw: unknown;
    try {
        raw = await request.json();
    } catch {
        return NextResponse.json({ code: 400, message: "请求体格式错误（需 JSON）", data: null }, { status: 400 });
    }

    const parsed = parseArticleIds(raw);
    if ("error" in parsed) {
        return NextResponse.json({ code: 400, message: parsed.error, data: null }, { status: 400 });
    }

    const cookieStore = await cookies();
    const token = cookieStore.get(ACCESS_TOKEN_KEY)?.value;
    if (!token) {
        return NextResponse.json({ code: 401, message: "未登录", data: null }, { status: 401 });
    }

    let res: Response;
    try {
        res = await fetch(`${API_URL}/articles/export`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ article_ids: parsed.ids }),
            cache: "no-store",
        });
    } catch {
        return NextResponse.json({ code: 502, message: "无法连接后端服务", data: null }, { status: 502 });
    }

    if (!res.ok) {
        const text = await res.text();
        let json: unknown = null;
        try {
            json = JSON.parse(text);
        } catch {
            // 非 JSON 错误页，按纯文本兜底
        }
        const message =
            (json as { message?: string } | null)?.message || text || `导出文章失败（HTTP ${res.status}）`;
        return NextResponse.json({ code: res.status, message, data: null }, { status: res.status });
    }

    const buffer = await res.arrayBuffer();

    const headers = new Headers();
    // 远端固定回 application/zip；这里仍读一次头，避免写死后端换格式时静默出错
    headers.set("Content-Type", res.headers.get("Content-Type") || "application/zip");
    // 文件名由远端决定（articles_export_<时间戳>.zip），前端下载时直接用它
    const disposition = res.headers.get("Content-Disposition");
    if (disposition) headers.set("Content-Disposition", disposition);
    headers.set("Cache-Control", "no-store");

    return new NextResponse(buffer, { status: 200, headers });
}
