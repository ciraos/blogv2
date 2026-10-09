import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { adminProxyFetch } from "@/lib/admin-api";

// 安装主题：POST /api/theme/install（需 JWTAuth）→ 远端 /theme/install。
//
// 契约（源码证据，非猜测）：
//  - internal/infra/router/router.go:767 注册 POST /theme/install（JWTAuth）。
//  - pkg/handler/theme/handler.go:194-236 InstallTheme：ShouldBindJSON → **handler 自己的**
//    ThemeInstallRequest（handler.go:42-46）：
//        { theme_name: string  必填 1..100，download_url: string 必填且必须是合法 url,
//          theme_market_id?: number }
//    ⚠️ 别被 pkg/service/theme/service.go:101-106 的同名结构体误导：那是 service 层入参
//    （market_id / theme_name / download_url / version），HTTP 绑定用的是 handler 那份，
//    所以请求体字段必须是 theme_market_id（不是 market_id）。
//  - handler.go:223-227：theme_name 必须以 "theme-" 开头（长度 ≥6 且前 6 字符相等）。
//  - 安装流程（service.go:826-881）：下载 download_url → 解压到 themes/ → 校验文件 → 写库；
//    已安装会报「主题 X 已经安装」（:840-842）。
//  - 注意：商城返回的官方主题 downloadUrl 为空串（线上实测 /public/theme/market），
//    URL 为空时后端直接 400「下载URL不能为空」——UI 侧对无 downloadUrl 的主题已禁用「安装」。
export async function POST(request: NextRequest) {
    let raw: string;
    try {
        raw = await request.text();
    } catch {
        return NextResponse.json({ code: 400, message: "请求体读取失败", data: null }, { status: 400 });
    }

    if (!raw.trim()) {
        return NextResponse.json(
            { code: 400, message: "缺少请求体（需 theme_name 与 download_url）", data: null },
            { status: 400 }
        );
    }

    return adminProxyFetch("/theme/install", {
        method: "POST",
        body: raw,
        headers: { "Content-Type": "application/json" },
    });
}
