"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";

import {
    AUTO_THEME_STORAGE_KEY,
    THEME_PREFERENCE_CHANGE_EVENT,
    THEME_STORAGE_KEY,
    getNextScheduledThemeDelay,
    isAutoThemeManaged,
    normalizeScheduledThemeConfig,
    resolveScheduledTheme,
    type ThemeSchedule,
} from "@/lib/scheduled-theme";

/**
 * 定时主题同步（后端 `DEFAULT_THEME_MODE = "auto"`，即按 THEME_LIGHT_START_TIME /
 * THEME_DARK_START_TIME 在深浅色之间自动切换）。挂在四个路由组的 ThemeProvider 内，不渲染 DOM。
 *
 * 规则（与官方前端一致）：
 *   1. **不跟用户抢**：localStorage 里 `theme` 有明确值（且不是 "system"）说明用户手动选过，
 *      此时不接管；一旦开始接管，就写 AUTO_THEME_STORAGE_KEY = "true" 作为标记。
 *   2. 接管后：立刻按当前时间设一次主题，并按「距下个边界还有多久」挂一个定时器；
 *      切标签页回来 / 窗口聚焦 / bfcache 恢复 / 其它标签页改了主题，都会重新计算
 *      （笔记本合盖、跨时段、跨时区都能跟上）。
 *   3. 用户在界面上手动切主题（见 floating-actions 的深浅色按钮）会派发
 *      THEME_PREFERENCE_CHANGE_EVENT → 这里停掉定时器，之后交给用户。
 */
export function ThemeScheduleSync({ schedule }: { schedule: ThemeSchedule }) {
    const { setTheme } = useTheme();

    useEffect(() => {
        const config = normalizeScheduledThemeConfig(schedule);
        let timer: number | null = null;

        const clearTimer = () => {
            if (timer !== null) {
                window.clearTimeout(timer);
                timer = null;
            }
        };

        const storedTheme = (): string | null => {
            try {
                const value = window.localStorage.getItem(THEME_STORAGE_KEY);
                return value === "" ? null : value;
            } catch {
                return null;
            }
        };

        const markManaged = () => {
            try {
                window.localStorage.setItem(AUTO_THEME_STORAGE_KEY, "true");
            } catch {
                // 隐私模式：忽略，本次仍然按时间设置主题
            }
        };

        const apply = () => {
            clearTimer();
            const stored = storedTheme();
            const managed = isAutoThemeManaged();
            // 用户没手动选过（没有记录 / 选的是跟随系统）才算「可以接管」
            const userPicked = stored !== null && stored !== "system";

            if (schedule.mode === "auto") {
                if (userPicked && !managed) return;
                if (!managed) markManaged();
                const now = new Date();
                setTheme(resolveScheduledTheme(now, config));
                timer = window.setTimeout(apply, getNextScheduledThemeDelay(now, config));
                return;
            }

            // 非 auto：若之前被定时机制托管过，落地一次配置值并解除托管
            if (managed) {
                try {
                    window.localStorage.removeItem(AUTO_THEME_STORAGE_KEY);
                } catch {
                    // 忽略
                }
            }
            if (managed || stored === null) {
                setTheme(schedule.mode === "dark" ? "dark" : "light");
            }
        };

        const onVisibilityChange = () => {
            if (document.visibilityState === "visible") apply();
        };
        const onStorage = (event: StorageEvent) => {
            // 其它标签页改了主题 / 托管标记（key 为 null 表示 localStorage 被清空）
            if (event.key === THEME_STORAGE_KEY || event.key === AUTO_THEME_STORAGE_KEY || event.key === null) {
                apply();
            }
        };
        const onPreferenceChange = () => clearTimer();

        apply();

        document.addEventListener("visibilitychange", onVisibilityChange);
        window.addEventListener("focus", apply);
        window.addEventListener("pageshow", apply);
        window.addEventListener("storage", onStorage);
        window.addEventListener(THEME_PREFERENCE_CHANGE_EVENT, onPreferenceChange);

        return () => {
            clearTimer();
            document.removeEventListener("visibilitychange", onVisibilityChange);
            window.removeEventListener("focus", apply);
            window.removeEventListener("pageshow", apply);
            window.removeEventListener("storage", onStorage);
            window.removeEventListener(THEME_PREFERENCE_CHANGE_EVENT, onPreferenceChange);
        };
    }, [setTheme, schedule]);

    return null;
}
