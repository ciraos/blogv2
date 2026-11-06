/* eslint-disable @next/next/no-img-element -- 站点 Logo 是后端 /static 下的静态图，走 rewrites 同源代理，用不上 next/image */
"use client";

import Link from "next/link";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

import { clearAutoThemeManagement } from "@/lib/scheduled-theme";

/**
 * 登录 / 注册 / 激活页共用的表单面板。
 *
 * 编辑部风之后不再用「浮在渐变背景上的圆角卡片」，改成左右分栏的纸张布局：
 * 左侧是刊头（站名 + 导语 + 返回首页），右侧就是这块面板 —— 只留一条竖线分隔，
 * 表单直接排在纸面上，不再套一层边框与阴影。
 *
 * 窄屏（<lg）左栏隐藏，面板顶部保留横向 Logo 作为品牌标识。
 */
export function AuthCard({
    appName,
    logoDay,
    logoNight,
    children,
}: {
    appName: string;
    logoDay: string;
    logoNight: string;
    children: React.ReactNode;
}) {
    const { resolvedTheme, setTheme } = useTheme();

    return (
        <div className="auth-panel relative w-full max-w-[360px]">
            {/* 深浅色切换：放在面板右上角，和表单同一条竖线内 */}
            <button
                type="button"
                aria-label="深浅色切换"
                title="深浅色切换"
                onClick={() => {
                    clearAutoThemeManagement();
                    setTheme(resolvedTheme === "dark" ? "light" : "dark");
                }}
                className="absolute -top-1 right-0 z-10 flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
                <Moon className="size-4 dark:hidden" />
                <Sun className="hidden size-4 dark:block" />
            </button>

            {/* 窄屏品牌头（宽屏由左栏的刊头承担） */}
            <div className="mb-8 lg:hidden">
                <Link href="/" aria-label={`返回 ${appName} 首页`} className="inline-block">
                    <img
                        src={logoDay}
                        alt={appName}
                        className="h-9 w-auto max-w-[160px] object-contain dark:hidden"
                    />
                    <img
                        src={logoNight}
                        alt=""
                        aria-hidden="true"
                        className="hidden h-9 w-auto max-w-[160px] object-contain dark:block"
                    />
                </Link>
            </div>

            {children}
        </div>
    );
}
