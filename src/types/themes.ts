// ===================== 主题（主题商城）相关类型 =====================
// 字段来源：src/components/admin/themes-manager.tsx 里的内联类型与中文标签常量（未做任何改动），
// 那里注明字段名与官方前端 theme-mall.ts 严格对齐。
// 远端路径：/theme/installed（已安装）、/theme/official（官方）；
// 同源代理 /api/admin/themes/installed、/api/admin/themes/official（本次新增，仅 GET）。
// 列表响应形状（已线上探活确认）：{ list, total }。

/** 官方 Theme.themeType → 中文 */
export const THEME_TYPE_LABEL: Record<string, string> = {
    community: "社区主题",
    pro: "Pro 主题",
};

/** 官方 Theme.deployType → 中文 */
export const DEPLOY_TYPE_LABEL: Record<string, string> = {
    standard: "标准版",
    ssr: "SSR 版",
};

/** 官方 Theme.ssrStatus → 中文 */
export const SSR_STATUS_LABEL: Record<string, string> = {
    not_installed: "未安装",
    installed: "已安装",
    running: "运行中",
    error: "异常",
};

/** 官方 Theme（字段名严格对齐 theme-mall.ts） */
export interface Theme {
    id?: number;
    name?: string;
    author?: string;
    description?: string;
    themeType?: "community" | "pro" | string;
    deployType?: "standard" | "ssr" | string;
    version?: string;
    price?: number | string;
    previewUrl?: string;
    demoUrl?: string;
    downloadCount?: number;
    rating?: number;
    isOfficial?: boolean;
    isActive?: boolean;
    is_current?: boolean;
    is_installed?: boolean;
    installed_version?: string;
    ssrStatus?: "not_installed" | "installed" | "running" | "error" | string;
}

/** 主题列表响应 data（已安装 / 官方共用；⚠️ 只有 list / total） */
export interface ThemeListData {
    list: Theme[];
    total: number;
}
