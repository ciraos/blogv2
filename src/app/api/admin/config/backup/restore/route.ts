import type { NextRequest } from "next/server";

import { adminProxyFetch } from "@/lib/admin-api";

// 恢复配置备份（⚠️ 高危，会用备份覆盖当前数据库配置）：POST 转发到远端 /config/backup/restore
// （router.go:886，需管理员登录）。请求体 { filename }，后端 binding:"required"（handler.go:35-38）。
// 这里先做一次非空校验：缺 filename 的调用远端必然 400，本地拦下可以给出更清楚的中文提示。
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

    return adminProxyFetch("/config/backup/restore", {
        method: "POST",
        body: JSON.stringify({ filename }),
    });
}
