import type { NextRequest } from "next/server";

import { adminProxyFetch } from "@/lib/admin-api";

// 获取主题配置定义：GET /api/theme/settings?theme_name=xxx（需 JWTAuth）→ 远端 /theme/settings。
//
// 契约（源码证据，非猜测）：
//  - internal/infra/router/router.go:787 注册 GET /theme/settings（JWTAuth）。
//  - pkg/handler/theme/handler.go:612-637 GetThemeSettings：只读 query 参数 theme_name（必填，空则 400）。
//  - 返回 data 为 []ThemeSettingGroup（pkg/service/theme/service.go:155-196）：
//        [{ group, label, fields: [{ name, label, type, default?, placeholder?, description?,
//           required?, options?: [{label, value}], validation?, condition? }] }]
//      type ∈ text | textarea | number | select | color | switch | image | code（:165）。
//  - 官方主题（isOfficialTheme）直接返回空数组，不读磁盘（service.go:2177-2181）。
// 纯 GET 只读，参数原样透传。
export async function GET(request: NextRequest) {
    const qs = request.nextUrl.searchParams.toString();
    return adminProxyFetch(`/theme/settings${qs ? `?${qs}` : ""}`, { method: "GET" });
}
