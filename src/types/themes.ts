// ===================== 主题（主题商城）相关类型 =====================
// 字段来源：src/components/admin/themes-manager.tsx 里的内联类型与中文标签常量（未做任何改动），
// 那里注明字段名与官方前端 theme-mall.ts 严格对齐。
// 远端路径：/theme/installed（已安装）、/public/theme/market（主题市场）；
// 同源代理 GET /api/admin/themes/installed、GET /api/admin/themes/official。
// 列表响应形状（已线上探活确认）：{ list, total }。
//
// 本轮补齐的写操作 / 配置类型来源（均照后端源码，不猜）：
//  - pkg/handler/theme/handler.go:42-64（安装/切换/卸载请求、上传响应）
//  - pkg/service/theme/service.go:155-214（配置分组 / 字段 / 选项 / 校验结果）
//  - pkg/service/theme/service.go:295-299（ThemeConfigResponse）

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
    /** 下载地址：安装主题时必须项（后端 handler.go:44 要求合法 url，空串会被 400 拒绝）。
     *  线上 /public/theme/market 的官方主题该字段为空串，故「安装」按钮需据此禁用。 */
    downloadUrl?: string;
}

/** 主题列表响应 data（已安装 / 官方共用；⚠️ 只有 list / total） */
export interface ThemeListData {
    list: Theme[];
    total: number;
}

// ===================== 主题配置（后端 theme.json 的 settings 段） =====================

/** 配置项可选值（后端 ThemeSettingOption，service.go:176-179） */
export interface ThemeSettingOption {
    label: string;
    /** 后端是 interface{}：可能是 string / number / bool */
    value: string | number | boolean;
}

/** 字段验证规则（后端 ThemeFieldValidation，service.go:182-189） */
export interface ThemeFieldValidation {
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
    pattern?: string;
    message?: string;
}

/** 字段显示条件（后端 ThemeFieldCondition，service.go:192-196） */
export interface ThemeFieldCondition {
    /** 依赖的字段名 */
    field: string;
    /** eq | neq | contains | gt | lt */
    operator?: string;
    value?: string | number | boolean;
}

/**
 * 单个配置字段（后端 ThemeSettingField，service.go:162-173）。
 * type ∈ text | textarea | number | select | color | switch | image | code
 */
export interface ThemeSettingField {
    name: string;
    label: string;
    type?: string;
    /** 后端是 interface{}，可能是 string / number / boolean */
    default?: string | number | boolean;
    placeholder?: string;
    description?: string;
    required?: boolean;
    options?: ThemeSettingOption[];
    validation?: ThemeFieldValidation;
    condition?: ThemeFieldCondition;
}

/** 配置分组（后端 ThemeSettingGroup，service.go:155-159） */
export interface ThemeSettingGroup {
    group: string;
    label: string;
    fields: ThemeSettingField[];
}

/** 配置表单的值表：字段名 → 值（后端是 map[string]interface{}，这里收窄为可 JSON 化的标量） */
export type ThemeConfigValues = Record<string, string | number | boolean>;

/** GET /api/theme/current-config 的 data（后端 ThemeConfigResponse，service.go:295-299） */
export interface ThemeConfigResponse {
    theme_name: string;
    settings: ThemeSettingGroup[];
    values: Record<string, unknown>;
}

/** POST /api/theme/upload 的 data（后端 ThemeUploadResponse，handler.go:59-64） */
export interface ThemeUploadResponse {
    theme_name: string;
    theme_info?: Theme;
    installed: boolean;
    message: string;
}

/** 主题元信息（后端 ThemeMetadata 的关键子集，service.go:133-152）：校验结果里会带 */
export interface ThemeMetadata {
    name?: string;
    displayName?: string;
    version?: string;
    description?: string;
    author?: string | Record<string, string>;
    license?: string;
    homepage?: string;
    keywords?: string[];
    category?: string;
    features?: string[];
    settings?: ThemeSettingGroup[];
}

/** POST /api/theme/validate 的 data（后端 ThemeValidationResult，service.go:205-214） */
export interface ThemeValidationResult {
    is_valid: boolean;
    errors: string[] | null;
    warnings: string[] | null;
    metadata: ThemeMetadata | null;
    file_list: string[] | null;
    total_size: number;
    /** 同名主题已安装时返回（官方前端据此比较版本决定是否 force_update） */
    existing_theme?: Theme;
}
