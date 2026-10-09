import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { adminProxyFetch } from "@/lib/admin-api";

// 主题配置值：GET（读用户已保存值）/ POST（保存）都转发到远端 /theme/config（需 JWTAuth）。
//
// 契约（源码证据，非猜测）：
//  - internal/infra/router/router.go:790 注册 GET  /theme/config（GetUserThemeConfig）
//                                  :793 注册 POST /theme/config（SaveUserThemeConfig）
//  - GET（handler.go:651-675）：query 参数 theme_name（必填，空则 400）；
//    返回 data 为 map[string]interface{}（用户已保存的裸配置，**不含**默认值；未安装会报「主题 X 未安装」）。
//  - POST（handler.go:690-715）：ShouldBindJSON → ThemeConfigRequest（handler.go:595-598）：
//        { theme_name: string 必填, config: map[string]interface{} 必填 }
//    服务层先按 settings 定义校验（service.go:2296-2337：required 字段缺失 / 类型 / min-max / pattern），
//    再整体覆盖写入 user_theme_config（:2237-2244）——即**整体替换**，所以前端要提交全量字段。
// 注意 GET 与 POST 是同一路径的不同方法，必须同时导出，避免新增页面对 /config 的 GET 落到别处。
export async function GET(request: NextRequest) {
    const qs = request.nextUrl.searchParams.toString();
    return adminProxyFetch(`/theme/config${qs ? `?${qs}` : ""}`, { method: "GET" });
}

export async function POST(request: NextRequest) {
    let raw: string;
    try {
        raw = await request.text();
    } catch {
        return NextResponse.json({ code: 400, message: "请求体读取失败", data: null }, { status: 400 });
    }

    if (!raw.trim()) {
        return NextResponse.json(
            { code: 400, message: "缺少请求体（需 theme_name 与 config）", data: null },
            { status: 400 }
        );
    }

    return adminProxyFetch("/theme/config", {
        method: "POST",
        body: raw,
        headers: { "Content-Type": "application/json" },
    });
}
