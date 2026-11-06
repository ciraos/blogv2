/* eslint-disable @next/next/no-img-element -- 站点 Logo 是后端 /static 下由 rewrites 同源代理的静态图，用不上 next/image */
"use client";

import Link from "next/link";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

import { clearAutoThemeManagement } from "@/lib/scheduled-theme";

/**
 * 登录 / 注册 / 激活页共用的品牌卡片外壳（由 (auth)/layout.tsx 包住各页内容）。
 *
 * 登录卡的结构：
 * 一张 max-w-400 的卡片 + 顶部横向 Logo（链回首页）+ 右上角主题切换；
 * 站点名 / 日夜双 Logo 都取自 site-config（LOGO_HORIZONTAL_DAY / LOGO_HORIZONTAL_NIGHT）。
 *
 * 这里不额外维护 mounted 状态：resolvedTheme 在服务端与客户端首帧都是 undefined，
 * 两端一致（都先渲染日间 Logo），挂载后才切到当前主题，不会有水合不一致。
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
        <div className="w-full max-w-[400px]">
            <div className="relative overflow-hidden rounded-2xl border bg-card shadow-lg shadow-black/5 dark:shadow-black/30">
                <button
                    type="button"
                    aria-label="深浅色切换"
                    title="深浅色切换"
                    // 只在点击时读 resolvedTheme（渲染输出不依赖它，见下方 Logo 注释）；
                    // 手动切换会解除「定时主题」托管，避免到时段边界被自动改回去
                    onClick={() => {
                        clearAutoThemeManagement();
                        setTheme(resolvedTheme === "dark" ? "light" : "dark");
                    }}
                    className="absolute right-4 top-4 z-10 flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                    <Moon className="size-4 dark:hidden" />
                    <Sun className="hidden size-4 dark:block" />
                </button>

                <div className="px-8 py-9 sm:px-10">
                    {/* 横向 Logo，链回首页。
                        日夜两套都渲染、交给 CSS 的 dark: 变体切换 —— next-themes 在客户端首帧就会给出
                        resolvedTheme（服务端是 undefined），若据此条件渲染，SSR 与首帧不一致会触发
                        React 的 hydration mismatch，所以这里不按主题状态分支。 */}
                    <div className="mb-8 text-center">
                        <Link href="/" aria-label={`返回 ${appName} 首页`} className="inline-block">
                            <img
                                src={logoDay}
                                alt={appName}
                                className="mx-auto h-10 w-auto max-w-[180px] object-contain dark:hidden"
                            />
                            <img
                                src={logoNight}
                                alt=""
                                aria-hidden="true"
                                className="mx-auto hidden h-10 w-auto max-w-[180px] object-contain dark:block"
                            />
                        </Link>
                    </div>

                    {children}
                </div>
            </div>
        </div>
    );
}
