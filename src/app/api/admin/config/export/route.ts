import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { API_URL } from "@/lib/api";
import { ACCESS_TOKEN_KEY } from "@/lib/auth";

// 导出配置数据：GET 转发到远端 /config/export（router.go:899，需管理员登录）。
//
// ⚠️ 这里刻意不用 adminProxyFetch：它会把响应体重新 JSON.parse + NextResponse.json 包一遍，
//    于是 Content-Disposition（下载文件名）与 X-Exported-Keys-Count（导出条目数）会丢；
//    而远端导出接口正是靠这两个头告诉前端「文件名 + 导出了多少项」
//    （pkg/handler/config/import_export_handler.go:48-63），正文则是 raw JSON 文件流而非
//    { code, message, data } 信封。所以本路由原样透传响应体与这两个头。
// 失败时（未登录 / 远端 5xx）远端返回 JSON 信封，这里转成同形状的 JSON 交给前端提示。
export async function GET() {
    const cookieStore = await cookies();
    const token = cookieStore.get(ACCESS_TOKEN_KEY)?.value;
    if (!token) {
        return NextResponse.json({ code: 401, message: "未登录", data: null }, { status: 401 });
    }

    let res: Response;
    try {
        res = await fetch(`${API_URL}/config/export`, {
            method: "GET",
            headers: { Authorization: `Bearer ${token}` },
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
            (json as { message?: string } | null)?.message || text || `导出配置失败（HTTP ${res.status}）`;
        return NextResponse.json({ code: res.status, message, data: null }, { status: res.status });
    }

    const buffer = await res.arrayBuffer();

    const headers = new Headers();
    headers.set("Content-Type", "application/json; charset=utf-8");
    // 文件名由远端决定（anheyu-settings.json），前端下载时直接用它
    const disposition = res.headers.get("Content-Disposition");
    if (disposition) headers.set("Content-Disposition", disposition);
    // 导出条目数：前端用来提示「已导出 N 项配置」
    const keysCount = res.headers.get("X-Exported-Keys-Count");
    if (keysCount) headers.set("X-Exported-Keys-Count", keysCount);
    headers.set("Cache-Control", "no-store");

    return new NextResponse(buffer, { status: 200, headers });
}
