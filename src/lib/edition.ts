import { cache } from "react";

import { API_URL } from "@/lib/api";

/**
 * 后端发行版判断：社区版（`anheyu/anheyu-backend`）还是 PRO（`anheyu/pro`）。
 *
 * 依据（源码证据）：
 *  - 社区版只注册 `GET /api/version`、`GET /api/version/string`（internal/infra/router/router.go）；
 *  - PRO 额外注册 `GET /api/pro/version`（官方前端 lib/version.ts 就是这么判断的）；
 *  - 版本号本身区分不了：`version.GetVersion()` 在 PRO 下返回的是**社区核心**的版本号。
 *
 * 社区版访问 `/api/pro/version` 会命中 Gin 的 NoRoute（`frontend_router.go`），
 * 对 `/api/` 前缀直接返回 404 JSON：`{"code":404,"message":"API 路由未找到"}` —— 所以以 HTTP 状态 + JSON 形状双重判断。
 *
 * 注意：这里必须在**服务端**探测。本站的 Next 只代理了 /f、/api/f、/api/pro/f、/api/pro/images，
 * 没有通配 `/api/*` 代理，浏览器直接打 `/api/pro/version` 会 404。
 */
export type BackendEdition = "pro" | "community";

export const getBackendEdition = cache(async (): Promise<BackendEdition> => {
    // 手动覆盖（Docker / 本地调试用）：BACKEND_EDITION=pro|community 时跳过探测，
    // 省一次请求，也方便在社区版环境里验证「隐藏 PRO 入口」的效果。
    const forced = process.env.BACKEND_EDITION?.trim().toLowerCase();
    if (forced === "pro" || forced === "community") return forced;

    try {
        const res = await fetch(`${API_URL}/pro/version`, {
            headers: { Accept: "application/json" },
            // 发行版不会在运行中变化，缓存一小时足够
            next: { revalidate: 3600 },
        });
        if (!res.ok) return "community";
        const json = (await res.json()) as { code?: number; data?: unknown };
        // 反代把 404 兜成 HTML 时 json() 会抛，已被外层 catch 变成 community
        return json?.code === 200 && json?.data ? "pro" : "community";
    } catch {
        return "community";
    }
});

/** 是否 PRO 版（社区版 / 接口不可达都算 false） */
export async function isProEdition(): Promise<boolean> {
    return (await getBackendEdition()) === "pro";
}
