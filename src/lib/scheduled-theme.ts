// 定时主题（后端 DEFAULT_THEME_MODE = "auto"）的纯逻辑。
//
// 口径对齐官方前端（线上 bundle 里的 theme-schedule 模块，模块级常量/分支逐一比对过）：
//   - 浅色时段默认 08:00–20:00，其余时段深色；
//   - lightStart < darkStart：lightStart ≤ 现在 < darkStart → 浅色，否则深色；
//   - lightStart > darkStart（跨零点）：现在 ≥ lightStart 或 现在 < darkStart → 浅色，否则深色；
//   - 时间串非法（不是 HH:MM 或超出 00:00–23:59）**或两者相同**时，两个时间一起回退默认值；
//   - 只有「自动托管」标记为 "true"（AUTO_THEME_STORAGE_KEY）时才接管主题 ——
//     用户手动选过主题就不接管，避免和用户抢。
//
// 本文件不碰 window（两个 localStorage helper 自带 typeof window 守卫），服务端也能安全 import。

/** 浅色时段开始（默认值，与官方一致） */
export const DEFAULT_THEME_LIGHT_START_TIME = "08:00";

/** 深色时段开始（默认值，与官方一致） */
export const DEFAULT_THEME_DARK_START_TIME = "20:00";

/** 「主题由定时机制托管」的标记（localStorage） */
export const AUTO_THEME_STORAGE_KEY = "anheyu-theme-auto-managed";

/** next-themes 的存储键（用户手动选择的主题写这里） */
export const THEME_STORAGE_KEY = "theme";

/** 用户在界面上主动切换主题时派发：用来停掉自动托管 */
export const THEME_PREFERENCE_CHANGE_EVENT = "anheyu:theme-preference-change";

/** HH:MM（00:00–23:59） */
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export interface ScheduledThemeConfig {
    lightStartTime: string;
    darkStartTime: string;
    lightStartMinutes: number;
    darkStartMinutes: number;
}

/** 后端 theme 定时配置（只取用得到的三个键）；也接受 resolveThemeSchedule 的返回值直接回传 */
export interface ThemeScheduleSource {
    DEFAULT_THEME_MODE?: string | null;
    THEME_LIGHT_START_TIME?: string | null;
    THEME_DARK_START_TIME?: string | null;
    /** 已归一化的排班（ThemeSchedule 用的键名），方便把 resolveThemeSchedule 的结果再喂进来 */
    lightStartTime?: string | null;
    darkStartTime?: string | null;
}

export interface ThemeSchedule {
    /** 后端 DEFAULT_THEME_MODE：light / dark / auto（非法值按 light 处理） */
    mode: "light" | "dark" | "auto";
    lightStartTime: string;
    darkStartTime: string;
    /** SSR 首帧用的主题：auto 时先按**服务器时钟**算一个，客户端挂载后再按访客本地时间校正 */
    initial: "light" | "dark";
}

export function isValidScheduledThemeTime(value: unknown): value is string {
    return typeof value === "string" && TIME_PATTERN.test(value.trim());
}

/** "HH:MM" → 当天第几分钟 */
export function timeToMinutes(value: string): number {
    const [hours, minutes] = value.split(":");
    return Number(hours) * 60 + Number(minutes);
}

/** 归一化时间配置：两个都合法且不同才采用，否则一起回退默认值（与官方同口径） */
export function normalizeScheduledThemeConfig(input?: ThemeScheduleSource | null): ScheduledThemeConfig {
    // 两种键名都认：后端配置的 THEME_*_START_TIME，或已归一化的 lightStartTime/darkStartTime
    const light = input?.THEME_LIGHT_START_TIME ?? input?.lightStartTime ?? null;
    const dark = input?.THEME_DARK_START_TIME ?? input?.darkStartTime ?? null;
    const usable = isValidScheduledThemeTime(light) && isValidScheduledThemeTime(dark) && light !== dark;

    const lightStartTime = usable ? light : DEFAULT_THEME_LIGHT_START_TIME;
    const darkStartTime = usable ? dark : DEFAULT_THEME_DARK_START_TIME;

    return {
        lightStartTime,
        darkStartTime,
        lightStartMinutes: timeToMinutes(lightStartTime),
        darkStartMinutes: timeToMinutes(darkStartTime),
    };
}

/** 给定时刻该用哪套主题 */
export function resolveScheduledTheme(date: Date, config: ScheduledThemeConfig): "light" | "dark" {
    const minutes = date.getHours() * 60 + date.getMinutes();
    const { lightStartMinutes: light, darkStartMinutes: dark } = config;
    // 跨零点时（浅色时段跨过 00:00）判定反过来
    const isLight = light < dark ? minutes >= light && minutes < dark : minutes >= light || minutes < dark;
    return isLight ? "light" : "dark";
}

/** 距离下一个时段边界（浅色开始 / 深色开始里更近的那个）还有多少毫秒 */
export function getNextScheduledThemeDelay(date: Date, config: ScheduledThemeConfig): number {
    const now = date.getTime();
    const next = [config.lightStartMinutes, config.darkStartMinutes].map((minutes) => {
        const at = new Date(
            date.getFullYear(),
            date.getMonth(),
            date.getDate(),
            Math.floor(minutes / 60),
            minutes % 60,
            0,
            0
        );
        if (at.getTime() <= now) at.setDate(at.getDate() + 1);
        return at.getTime();
    });
    return Math.min(...next) - now;
}

/** 从后端站点配置里解析出「模式 + 两个时间 + SSR 首帧主题」 */
export function resolveThemeSchedule(config?: ThemeScheduleSource | null): ThemeSchedule {
    const raw = config?.DEFAULT_THEME_MODE;
    const mode: ThemeSchedule["mode"] = raw === "dark" || raw === "auto" ? raw : "light";

    const normalized = normalizeScheduledThemeConfig(config);
    const initial: ThemeSchedule["initial"] =
        mode === "dark" ? "dark" : mode === "auto" ? resolveScheduledTheme(new Date(), normalized) : "light";

    return {
        mode,
        lightStartTime: normalized.lightStartTime,
        darkStartTime: normalized.darkStartTime,
        initial,
    };
}

/** 当前主题是否由定时机制托管 */
export function isAutoThemeManaged(): boolean {
    if (typeof window === "undefined") return false;
    try {
        return window.localStorage.getItem(AUTO_THEME_STORAGE_KEY) === "true";
    } catch {
        return false;
    }
}

/**
 * 用户主动切主题时调用：解除托管并通知挂载中的同步组件停掉定时器。
 * 之后（包括下次打开页面）都尊重用户这次的选择，直到用户清掉 localStorage 里的 theme。
 */
export function clearAutoThemeManagement(): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.removeItem(AUTO_THEME_STORAGE_KEY);
    } catch {
        // 隐私模式：忽略
    }
    window.dispatchEvent(new Event(THEME_PREFERENCE_CHANGE_EVENT));
}
