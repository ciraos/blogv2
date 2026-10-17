import type { Metadata } from "next";
import "../globals.css";
import { AuthCard } from "@/components/(auth)/auth-card";
import { ThemeProvider } from "@/components/ui/theme-provider";
import { ThemeScheduleSync } from "@/components/ui/theme-schedule-sync";
import { TopProgress } from "@/components/ui/top-progress";
import { resolveAppearance } from "@/lib/appearance";
import { resolveThemeSchedule } from "@/lib/scheduled-theme";
import { getSiteConfigs, resolveSiteIcons } from "@/lib/site-config";

export async function generateMetadata(): Promise<Metadata> {
    // 与整页共用同一份配置（lib/site-config.ts 用 React cache 同请求去重），不再单独 fetch；
    // 取不到时 resolveSiteIcons 会退回本地 favicon.ico，不会把登录页打成 500
    const config = await getSiteConfigs();
    return { icons: resolveSiteIcons(config) };
}

export default async function AuthLayout({ children }: Readonly<{ children: React.ReactNode; }>) {
    const config = await getSiteConfigs();
    // 站点外观：按后端 APPEARANCE_SKIN / APPEARANCE_TOKENS 生成皮肤变量（浅/深各一套），
    // 与 (blog)/admin 两个 layout 一致。这里以前漏了注入，导致 --primary 退回 globals.css 的
    // 近黑色默认值 —— 登录/注册按钮用的是 bg-primary，所以显示不出主题色。
    const appearance = resolveAppearance(config?.APPEARANCE_SKIN, config?.APPEARANCE_TOKENS);
    // 定时主题（DEFAULT_THEME_MODE = "auto"）：SSR 首帧按服务器时钟，客户端由 ThemeScheduleSync 校正
    const schedule = resolveThemeSchedule(config);

    return (
        <html lang="zh-CN" suppressHydrationWarning data-skin={appearance.skinId}>
            <head>
                <style dangerouslySetInnerHTML={{ __html: appearance.css }} />
            </head>
            <body className="">

                <ThemeProvider
                    attribute="class"
                    defaultTheme={schedule.initial}
                    disableTransitionOnChange
                    enableSystem
                    enableColorScheme
                >
                    {/* 顶部进度条：登录/注册之间的软导航反馈 */}
                    <TopProgress />

                    {/* 定时主题：auto 时按两个时段自动切换（不占 DOM） */}
                    <ThemeScheduleSync schedule={schedule} />

                    <div id="CIRAOS">

                        {/* 背景：容器渐变 + 主题色柔光（主色来自外观皮肤，卡片浮在其上） */}
                        <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-linear-to-br from-background to-muted p-6">
                            <div
                                aria-hidden="true"
                                className="pointer-events-none absolute -top-1/3 left-1/2 size-[46rem] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
                            />
                            <div className="relative flex w-full justify-center">
                                <AuthCard
                                    appName={config?.APP_NAME ?? "博客"}
                                    logoDay={config?.LOGO_HORIZONTAL_DAY || config?.LOGO_URL || "/favicon.ico"}
                                    logoNight={config?.LOGO_HORIZONTAL_NIGHT || config?.LOGO_HORIZONTAL_DAY || config?.LOGO_URL || "/favicon.ico"}
                                >
                                    {children}
                                </AuthCard>
                            </div>
                        </div>

                        {/* <div id="footer" className="">
                            <Link href="https://beian.miit.gov.cn" target="_blank" rel="noopener external nofollow noreferrer" className="flex items-center justify-center hover:underline">{config?.ICP_NUMBER}</Link>
                        </div> */}

                    </div>
                </ThemeProvider>

            </body>
        </html>
    );
}
