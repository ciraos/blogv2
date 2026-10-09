import type { NextRequest } from "next/server";

import { adminProxyFetch } from "@/lib/admin-api";

// 清理旧备份：POST 转发到远端 /config/backup/clean（router.go:892，需管理员登录）。
// 请求体 { keep_count }：后端 binding:"required,min=1"，且 >100 直接返回 400
// （handler.go:46-48、180-183）。本地按同一口径先拦，提示比远端报错更直白。
export async function POST(request: NextRequest) {
    let keepCount: unknown;
    try {
        keepCount = ((await request.json()) as { keep_count?: unknown })?.keep_count;
    } catch {
        return Response.json({ code: 400, message: "请求体格式错误", data: null }, { status: 400 });
    }

    if (typeof keepCount !== "number" || !Number.isInteger(keepCount) || keepCount < 1 || keepCount > 100) {
        return Response.json(
            { code: 400, message: "保留数量必须是 1~100 的整数", data: null },
            { status: 400 }
        );
    }

    return adminProxyFetch("/config/backup/clean", {
        method: "POST",
        body: JSON.stringify({ keep_count: keepCount }),
    });
}
