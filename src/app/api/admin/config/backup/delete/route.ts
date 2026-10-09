import type { NextRequest } from "next/server";

import { adminProxyFetch } from "@/lib/admin-api";

// 删除配置备份：POST 转发到远端 /config/backup/delete（router.go:889，需管理员登录）。
// 请求体 { filename }，后端 binding:"required"（handler.go:40-43）。
// 同 restore：本地先拦掉空 filename，避免一次注定 400 的往返。
export async function POST(request: NextRequest) {
    let filename: unknown;
    try {
        filename = ((await request.json()) as { filename?: unknown })?.filename;
    } catch {
        return Response.json({ code: 400, message: "请求体格式错误", data: null }, { status: 400 });
    }

    if (typeof filename !== "string" || filename.trim() === "") {
        return Response.json({ code: 400, message: "缺少备份文件名 filename", data: null }, { status: 400 });
    }

    return adminProxyFetch("/config/backup/delete", {
        method: "POST",
        body: JSON.stringify({ filename }),
    });
}
