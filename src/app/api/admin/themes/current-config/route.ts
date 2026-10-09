import { adminProxyFetch } from "@/lib/admin-api";

// 当前主题完整配置：GET /api/theme/current-config（需 JWTAuth）→ 远端 /theme/current-config。
//
// 契约（源码证据，非猜测）：
//  - internal/infra/router/router.go:796 注册 GET /theme/current-config（JWTAuth）。
//  - pkg/handler/theme/handler.go:727-745 GetCurrentThemeConfig：无 query 参数。
//  - 返回 data 为 ThemeConfigResponse（pkg/service/theme/service.go:295-299）：
//        { theme_name: string, settings: []ThemeSettingGroup, values: map[string]interface{} }
//    其中 values 已经把定义里的 default 与用户配置合并过（service.go:2285-2292）；
//    官方主题返回 settings=[] / values={}（:2262-2269）。
//  「主题详情」按钮用它一次拿到「当前主题名 + 字段定义 + 生效值」。
// 纯 GET 只读，无参数。
export async function GET() {
    return adminProxyFetch("/theme/current-config", { method: "GET" });
}
