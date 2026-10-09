import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { adminProxyFetch } from "@/lib/admin-api";

// 切换（应用）主题：POST /api/theme/switch（需 JWTAuth）→ 远端 /theme/switch。
//
// 契约（源码证据，非猜测）：
//  - internal/infra/router/router.go:776 注册 POST /theme/switch（themeAuth = JWTAuth，非 AdminAuth）。
//  - pkg/handler/theme/handler.go:250-285 SwitchTheme：c.ShouldBindJSON → SwitchThemeRequest，
//    结构体在 handler.go:433-435 { theme_name string `json:"theme_name" binding:"required"` }。
//  - 成功后响应 { code:200, message, data:null }，并额外带 Cache-Control/Pragma/Expires 头提示清缓存
//    （handler.go:280-282）——按处理器用 NextResponse.json 重新包装会丢掉它们，但本代理只回 JSON 信封，
//    前端读的是 message，不依赖这些头。
//  - 切换是**全站外观生效**的写操作：主题名必须已经安装（service.go:951-972 未安装报「主题 X 未安装」）。
//
// body 原样透传（不解析、不重排字段），由远端做 required 校验。
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

    return adminProxyFetch("/theme/switch", {
        method: "POST",
        body: raw,
        headers: { "Content-Type": "application/json" },
    });
}
