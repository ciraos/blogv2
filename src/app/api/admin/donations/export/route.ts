import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { API_URL } from "@/lib/api";

// 导出打赏记录：GET /api/admin/donations/export → 远端 GET /pro/admin/donations/export
// （PRO 模块，需管理员登录；线上只读探活：未带 token 返回 401）。
//
// ⚠️ 这里刻意不用 adminProxyFetch：它会把响应体重新 JSON.parse + NextResponse.json 包一遍，
//    于是 Content-Disposition（下载文件名）与正文都会被破坏；而远端导出接口返回的正是
//    **文件流**而不是 { code, message, data } 信封（官方 donation.ts:52-61 用
//    axios responseType:"blob" 接收）。所以本路由原样透传响应体与下载头，
//    做法与 /api/admin/config/export、/api/admin/comments/export 一致。
// 查询参数：ids=1,2,3（可选；缺省 = 导出全部，官方 exportDonations(ids?) 不传 ids 即全部）。
// 非法参数（不是正整数列表）本地直接 400，省掉必然失败的往返；除 ids 外不透传任何查询参数。
export async function GET(request: NextRequest) {
    const rawIds = request.nextUrl.searchParams.get("ids");

    const ids: number[] = [];
    if (rawIds !== null && rawIds.trim() !== "") {
        for (const part of rawIds.split(",")) {
            const value = part.trim();
            const num = Number(value);
            if (value === "" || !Number.isInteger(num) || num <= 0) {
                return NextResponse.json(
                    { code: 400, message: "ids 必须是正整数列表（如 ids=1,2,3）", data: null },
                    { status: 400 }
                );
            }
            ids.push(num);
        }
    }

    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) {
        return NextResponse.json({ code: 401, message: "未登录", data: null }, { status: 401 });
    }

    const query = ids.length > 0 ? `?ids=${ids.join(",")}` : "";

    let res: Response;
    try {
        res = await fetch(`${API_URL}/pro/admin/donations/export${query}`, {
            method: "GET",
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
        });
    } catch {
        return NextResponse.json({ code: 502, message: "无法连接后端服务", data: null }, { status: 502 });
    }

    if (!res.ok) {
        // 失败时远端返回 JSON 信封（未登录 / 500），转成同形状的 JSON 交给前端提示
        const text = await res.text();
        let json: unknown = null;
        try {
            json = JSON.parse(text);
        } catch {
            // 非 JSON 错误页，按纯文本兜底
        }
        const message =
            (json as { message?: string } | null)?.message || text || `导出打赏记录失败（HTTP ${res.status}）`;
        return NextResponse.json({ code: res.status, message, data: null }, { status: res.status });
    }

    const buffer = await res.arrayBuffer();

    const headers = new Headers();
    // 远端导出的是 JSON 数据文件（官方下载名 donations-YYYY-MM-DD.json），
    // 有 Content-Type 就原样透传，没有则按 JSON 兜底。
    headers.set("Content-Type", res.headers.get("Content-Type") || "application/json; charset=utf-8");
    // 文件名由远端决定，前端下载时优先用它（取不到则由前端按日期兜底命名）
    const disposition = res.headers.get("Content-Disposition");
    if (disposition) headers.set("Content-Disposition", disposition);
    headers.set("Cache-Control", "no-store");

    return new NextResponse(buffer, { status: 200, headers });
}
