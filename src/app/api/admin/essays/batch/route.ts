import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { adminProxyFetch } from "@/lib/admin-api";

// 批量删除说说：POST /api/admin/essays/batch → 远端 POST /pro/admin/essays/batch-delete
// （PRO 模块，需管理员登录；⚠️ 会删数据，按要求**不在线上实测**）。
//
// 远端契约（官方主题前端源码为准，src/lib/api/essay.ts:201-211 与
// hooks/queries/use-essays.ts:128-137）：body { ids: number[] }，返回 { code, message, data } 信封，
// 官方只判 code === 200（data 里的统计字段未文档化，这里也不猜，原样回给前端）。
// 这里沿用 adminProxyFetch（纯 JSON 接口，不存在文件流 / multipart 的问题），
// 但本地先按同一口径校验 body，非法请求直接 400，省掉必然失败的往返。
export async function POST(request: NextRequest) {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json(
            { code: 400, message: "请求体格式错误（需 JSON 对象）", data: null },
            { status: 400 }
        );
    }

    if (body === null || typeof body !== "object" || Array.isArray(body)) {
        return NextResponse.json(
            { code: 400, message: "请求体格式错误（需 JSON 对象）", data: null },
            { status: 400 }
        );
    }

    const rawIds = (body as { ids?: unknown }).ids;
    if (!Array.isArray(rawIds)) {
        return NextResponse.json({ code: 400, message: "ids 必须是数字数组", data: null }, { status: 400 });
    }

    const ids: number[] = [];
    for (const item of rawIds) {
        if (typeof item !== "number" || !Number.isInteger(item) || item <= 0) {
            return NextResponse.json(
                { code: 400, message: "ids 必须是正整数数组", data: null },
                { status: 400 }
            );
        }
        ids.push(item);
    }

    if (ids.length === 0) {
        return NextResponse.json({ code: 400, message: "请至少选择一条说说", data: null }, { status: 400 });
    }

    // 只把校验过的 ids 往下传，不原样透传整个 body
    return adminProxyFetch("/pro/admin/essays/batch-delete", {
        method: "POST",
        body: JSON.stringify({ ids }),
    });
}
