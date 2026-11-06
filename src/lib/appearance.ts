/**
 * 站点外观换肤：依据后端 APPEARANCE_SKIN / APPEARANCE_TOKENS 生成主题 CSS 变量。
 *
 * 皮肤数据与令牌口径：
 *   - 内置皮肤 id 即后端 APPEARANCE_SKIN 取值，共 8 套；
 *   - 每套皮肤「浅色 / 深色」两套令牌分别生效；
 *   - APPEARANCE_TOKENS 可在皮肤基础上按 { light: {...}, dark: {...} } 局部覆盖。
 */

/** 单模式（浅/深）下一组令牌（键名同官方） */
export interface AppearanceModeTokens {
    primary: string;
    primaryForeground: string;
    success: string;
    warning: string;
    danger: string;
    info: string;
    accent: string;
}

/** 官方令牌 → 本站（shadcn）CSS 变量映射 */
const TOKEN_TO_VAR: Record<keyof AppearanceModeTokens, string> = {
    primary: "--primary",
    primaryForeground: "--primary-foreground",
    // 官方 accent（辅助强调）在此映射到聚焦环
    accent: "--ring",
    danger: "--destructive",
    success: "--success",
    warning: "--warning",
    info: "--info",
};

const APPEARANCE_TOKEN_KEYS = Object.keys(TOKEN_TO_VAR) as (keyof AppearanceModeTokens)[];

/* 语义色（浅色 / 深色），取自官方预设 */
const L_SEM = { success: "#57bd6a", warning: "#c28b00", danger: "#d80020", info: "#3e86f6" };
const D_SEM = { success: "#3e9f50", warning: "#ffc93e", danger: "#ff3842", info: "#0084ff" };

function mode(
    primary: string,
    primaryForeground: string,
    accent: string,
    sem: Pick<AppearanceModeTokens, "success" | "warning" | "danger" | "info">
): AppearanceModeTokens {
    return { primary, primaryForeground, accent, ...sem };
}

/** 内置皮肤（id 写入后端 APPEARANCE_SKIN）——与官方 appearance-presets 一致 */
export const BUILT_IN_SKINS: Record<string, { light: AppearanceModeTokens; dark: AppearanceModeTokens }> = {
    // 品牌蓝：默认蓝 + 深色模式琥珀强调
    brand_blue: {
        light: mode("#163bf2", "#ffffff", "#7a60d2", L_SEM),
        dark: mode("#f5b82a", "#1a1508", "#a78bfa", D_SEM),
    },
    // 翡翠绿
    emerald: {
        light: mode("#059669", "#ffffff", "#0d9488", L_SEM),
        dark: mode("#34d399", "#052e26", "#5eead4", D_SEM),
    },
    // 紫罗兰
    violet: {
        light: mode("#6d28d9", "#ffffff", "#7c3aed", L_SEM),
        dark: mode("#c4b5fd", "#1e1b2e", "#a78bfa", D_SEM),
    },
    // 玫红
    rose: {
        light: mode("#e11d48", "#ffffff", "#db2777", L_SEM),
        dark: mode("#fb7185", "#2a121c", "#f472b6", D_SEM),
    },
    // 琥珀
    amber: {
        light: mode("#d97706", "#ffffff", "#b45309", L_SEM),
        dark: mode("#fbbf24", "#29220a", "#fcd34d", D_SEM),
    },
    // 青蓝
    cyan: {
        light: mode("#0891b2", "#ffffff", "#0e7490", L_SEM),
        dark: mode("#22d3ee", "#0c1e24", "#67e8f9", D_SEM),
    },
    // 板岩灰
    slate: {
        light: mode("#334155", "#ffffff", "#475569", L_SEM),
        dark: mode("#94a3b8", "#0f172a", "#cbd5e1", D_SEM),
    },
    // 深红
    crimson: {
        light: mode("#b91c1c", "#ffffff", "#991b1b", L_SEM),
        dark: mode("#f87171", "#2a0c0c", "#fca5a5", D_SEM),
    },
};

export const DEFAULT_SKIN_ID = "brand_blue";

/** 仅保留白名单键、且值为非空字符串的覆盖项 */
function sanitizeBranch(obj: unknown): Partial<AppearanceModeTokens> {
    const out: Partial<AppearanceModeTokens> = {};
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return out;
    const rec = obj as Record<string, unknown>;
    for (const key of APPEARANCE_TOKEN_KEYS) {
        const v = rec[key];
        if (typeof v === "string" && v.trim() !== "") out[key] = v.trim();
    }
    return out;
}

/** 解析 APPEARANCE_TOKENS（支持对象或 JSON 字符串，形如 { light:{}, dark:{} }） */
function parseTokensOverride(raw: unknown): { light?: Partial<AppearanceModeTokens>; dark?: Partial<AppearanceModeTokens> } {
    let value = raw;
    if (typeof value === "string") {
        const text = value.trim();
        if (!text || text === "{}") return {};
        try {
            value = JSON.parse(text);
        } catch {
            return {};
        }
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const rec = value as Record<string, unknown>;
    const result: { light?: Partial<AppearanceModeTokens>; dark?: Partial<AppearanceModeTokens> } = {};
    const light = sanitizeBranch(rec.light);
    const dark = sanitizeBranch(rec.dark);
    if (Object.keys(light).length > 0) result.light = light;
    if (Object.keys(dark).length > 0) result.dark = dark;
    return result;
}

function declarations(tokens: AppearanceModeTokens): string {
    return APPEARANCE_TOKEN_KEYS.map((key) => `${TOKEN_TO_VAR[key]}:${tokens[key]}`).join(";");
}

/**
 * 解析皮肤为 `{ skinId, css }`：
 *  - skinId 用于 <html data-skin>（未知皮肤回退默认）；
 *  - css 同时给出浅色与深色（.dark）两套变量，适配明暗模式。
 */
export function resolveAppearance(
    skin?: string | null,
    tokensOverride?: unknown
): { skinId: string; css: string } {
    const requested = skin?.trim() ?? "";
    const skinId = BUILT_IN_SKINS[requested] ? requested : DEFAULT_SKIN_ID;
    const preset = BUILT_IN_SKINS[skinId];
    const override = parseTokensOverride(tokensOverride);

    const light = { ...preset.light, ...override.light };
    const dark = { ...preset.dark, ...override.dark };

    const selector = `html[data-skin="${skinId}"]`;
    const css = `${selector}{${declarations(light)}}${selector}.dark{${declarations(dark)}}`;
    return { skinId, css };
}
