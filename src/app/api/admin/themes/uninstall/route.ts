import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { adminProxyFetch } from "@/lib/admin-api";

// 卸载主题：POST /api/theme/uninstall（需 JWTAuth）→ 远端 /theme/uninstall。
//
// 契约（源码证据，非猜测）：
//  - internal/infra/router/router.go:782 注册 POST /theme/uninstall（JWTAuth）。
//  - pkg/handler/theme/handler.go:335-365 UninstallTheme：ShouldBindJSON → UninstallThemeRequest，
//    结构体在 handler.go:437-440 { theme_name string `json:"theme_name" binding:"required"` }。
//  - 服务层约束（pkg/service/theme/service.go:1137-1202）：
//      · 官方主题不可卸载 → 「不能卸载官方主题」（:1138-1140）
//      · 当前真正启用的主题不可卸载 → 「不能卸载当前使用的主题，请先切换到其他主题」（:1184-1186）
//      · 卸载会 os.RemoveAll 主题目录 + 删数据库记录（:1189-1198），不可恢复。
//    UI 侧已按 is_current / isOfficial 先禁用按钮，这里不再重复解析 body（远端仍是最终裁判）。
export async function POST(request: NextRequest) {
    let raw: string;
    try {
        raw = await request.text();
    } catch {
        return NextResponse.json({ code: 400, message: "请求体读取失败", data: null }, { status: 400 });
    }

    if (!raw.trim()) {
        return NextResponse.json({ code: 400, message: "缺少请求体（需 theme_name）", data: null }, { status: 400 });
    }

    return adminProxyFetch("/theme/uninstall", {
        method: "POST",
        body: raw,
        headers: { "Content-Type": "application/json" },
    });
}
