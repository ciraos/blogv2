import type { NextRequest } from "next/server";

import { adminProxyFetch } from "@/lib/admin-api";

// 创建配置备份：POST 转发到远端 /config/backup/create（router.go:880，需管理员登录）。
// 请求体 { description?: string, is_auto?: boolean }（handler.go:30-33）：
// description 为空时由后端兜底成「手动备份」，所以允许空字符串 / 不传该字段。
// 响应 data 为新建的 BackupInfo（filename / size / created_at / description / is_auto）。
//
// ⚠️ 这里是唯一一条「参数不合法也必须本地拦下」的写路由：body 不是合法 JSON、或
//    description 不是字符串时一律 400，不带着兜底值转发。否则一个前端 bug 就会在
//    管理员毫不知情的情况下真的创建出备份文件（写操作不该由代理层的容错来触发）。
export async function POST(request: NextRequest) {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return Response.json({ code: 400, message: "请求体格式错误", data: null }, { status: 400 });
    }

    const raw = body && typeof body === "object" ? (body as { description?: unknown }).description : undefined;
    if (raw !== undefined && typeof raw !== "string") {
        return Response.json({ code: 400, message: "description 必须是字符串", data: null }, { status: 400 });
    }

    return adminProxyFetch("/config/backup/create", {
        method: "POST",
        body: JSON.stringify({ description: raw ?? "" }),
    });
}
