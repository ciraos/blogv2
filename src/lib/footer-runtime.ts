/**
 * 页脚「运行时间」的纯计算逻辑（服务端算初值 / 客户端每秒刷新共用一份）。
 *
 * 口径对齐官方主题 AnHeYu 的 `layout/includes/third-party/runtime/runtime-js.pug`：
 *   1. 天数、时分秒由 `launch_time` 与当前时间做差，再按「天 → 时 → 分 → 秒」逐级向下取整；
 *   2. 上班 / 休息**只看小时**：`9 <= 小时 < 18` 算上班，其余（含凌晨与晚间）算休息。
 *      官方原文：`if (nowHour < 18 && nowHour >= 9)` —— 不看星期、不看分钟，也不看是否节假日；
 *      而且用的是**浏览器本地时间**（访客所在时区），不是服务器时区。
 */

export interface RuntimeState {
    /** 是否处于「上班」状态（否则为休息） */
    isWork: boolean;
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
    /** 官方同款文案：本站居然运行了 X 天 YY 小时 MM 分 SS 秒 */
    text: string;
}

const pad2 = (value: number) => String(value).padStart(2, "0");

/**
 * 解析后台的 `footer.runtime.launch_time`。
 *
 * 后端存的是**不带时区**的本地时间字符串：线上实测是 `02/25/2026 14:07:09`（美式 月/日/年，
 * 与官方 _config.yml 里 `04/01/2021 00:00:00` 的「Month/Day/Year」说明一致），
 * 而后台日期选择器写回的是 `YYYY-MM-DD HH:mm:ss`，因此两种顺序都要吃。
 *
 * 为什么不直接 `new Date(字符串)`：`new Date("2026-02-25 14:07:09")` 属于实现相关行为，
 * Safari 等引擎会得到 Invalid Date；显式拆字段还能顺手挡掉 `2026-02-31` 这类溢出日期。
 * 传入 `new Date(y, m, d, ...)` 即按本地时区解释，与官方 `new Date(launch_time)` 语义一致。
 */
export function parseLaunchTime(value?: string): Date | null {
    const raw = value?.trim();
    if (!raw) return null;

    // 带时区的完整 ISO（2024-01-01T00:00:00+08:00 / ...Z）交给原生解析，语义无歧义
    if (/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)) {
        const iso = new Date(raw);
        return Number.isNaN(iso.getTime()) ? null : iso;
    }

    const matched = raw.match(
        /^(?:(\d{4})[-/](\d{1,2})[-/](\d{1,2})|(\d{1,2})[-/](\d{1,2})[-/](\d{4}))(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
    );
    if (!matched) return null;

    // 四位数年份在前 → 年/月/日；在后 → 月/日/年
    const yearFirst = Boolean(matched[1]);
    const year = Number(yearFirst ? matched[1] : matched[6]);
    const month = Number(yearFirst ? matched[2] : matched[4]);
    const day = Number(yearFirst ? matched[3] : matched[5]);
    const hour = Number(matched[7] ?? 0);
    const minute = Number(matched[8] ?? 0);
    const second = Number(matched[9] ?? 0);

    const parsed = new Date(year, month - 1, day, hour, minute, second);
    // 月份/日期被 Date 自动进位说明原串是非法日期（如 2 月 31 日）
    if (parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return null;
    return parsed;
}

/**
 * 按当前时间算出运行时长与工作/休息状态。
 *
 * `launchTime` 传时间戳（服务端已经解析过一次），避免两端对同一字符串的解析口径不一致。
 * 上线时间在未来时钳到 0（官方会显示成负数天，明显不是想要的）。
 */
export function resolveRuntimeState(launchTime: number, now: Date): RuntimeState {
    const totalSeconds = Math.max(0, Math.floor((now.getTime() - launchTime) / 1000));

    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    // 官方规则：9 点（含）到 18 点（不含）算上班，其余算休息
    const hour = now.getHours();
    const isWork = hour >= 9 && hour < 18;

    return {
        isWork,
        days,
        hours,
        minutes,
        seconds,
        text: `本站居然运行了 ${days} 天 ${pad2(hours)} 小时 ${pad2(minutes)} 分 ${pad2(seconds)} 秒`,
    };
}

/**
 * 把 `footer.badge.list[].shields` 解析成可直接放进 `<img src>` 的地址。
 *
 * 后端的默认值与线上值都是**完整图片地址**（多吉云图床的 SVG），
 * 但配置项本身是 shields.io 的参数口径（形如 `badge/AnHeYu-v2-blue`），
 * 所以只填了片段时补上 `https://img.shields.io/` 前缀，两种写法都能用。
 */
export function resolveBadgeSrc(shields?: string): string {
    const value = shields?.trim();
    if (!value) return "";
    if (/^https?:\/\//i.test(value) || value.startsWith("//")) return value;
    return `https://img.shields.io/${value.replace(/^\/+/, "")}`;
}
