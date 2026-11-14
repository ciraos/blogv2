import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { adminProxyFetch } from "@/lib/admin-api";

/**
 * SSR 主题 · 安装（管理员）。
 *
 * 远端：`POST /admin/ssr-theme/install`，body { themeName, version?, downloadUrl }
 * （API_URL 已含 /api 前缀，所以这里写 /admin/...）。
 *
 * 与「上传主题」（/theme/upload）的区别：
 *  · upload 收 multipart 的 ZIP，装的是**静态主题**（theme.json + index.html + static/）；
 *  · 本接口收 **JSON**，只给一个公网 downloadUrl，后端自己去下载 tar.gz，
 *    解压到 themes/<themeName>/ 后 `node server.js` 起进程（SSR 主题）。
 *    后端显式封了内网地址，所以 downloadUrl 必须是公网 http(s)。
 *
 * 为什么还要前端校验一遍：themeName 必须是 `theme-` 开头、downloadUrl 必须是 http(s)，
 * 否则后端会 400 —— 提前拦掉，省一次往返。
 */
export async function POST(request: NextRequest) {
    let body: { themeName?: unknown; version?: unknown; downloadUrl?: unknown };
    try {
        body = (await request.json()) as typeof body;
    } catch {
        return NextResponse.json({ code: 400, message: "请求体格式错误", data: null }, { status: 400 });
    }

    const themeName = typeof body?.themeName === "string" ? body.themeName.trim() : "";
    const version = typeof body?.version === "string" ? body.version.trim() : "";
    const downloadUrl = typeof body?.downloadUrl === "string" ? body.downloadUrl.trim() : "";

    if (!/^theme-[a-z0-9-]+$/.test(themeName)) {
        return NextResponse.json(
            { code: 400, message: "主题标识必须以 theme- 开头，且只能包含小写字母、数字与连字符", data: null },
            { status: 400 }
        );
    }
    if (!/^https?:\/\//i.test(downloadUrl)) {
        return NextResponse.json({ code: 400, message: "下载地址必须是 http(s) 链接", data: null }, { status: 400 });
    }

    return adminProxyFetch("/admin/ssr-theme/install", {
        method: "POST",
        body: JSON.stringify({ themeName, ...(version ? { version } : {}), downloadUrl }),
    });
}
