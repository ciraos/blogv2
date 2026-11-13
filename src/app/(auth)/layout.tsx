import type { Metadata } from "next";
import Link from "next/link";
import "../globals.css";
import { AuthCard } from "@/components/(auth)/auth-card";
import { ThemeProvider } from "@/components/ui/theme-provider";
import { ThemeScheduleSync } from "@/components/ui/theme-schedule-sync";
import { TopProgress } from "@/components/ui/top-progress";
import { resolveAppearance } from "@/lib/appearance";
import { resolveThemeSchedule } from "@/lib/scheduled-theme";
import { getSiteConfigs, resolveSiteIcons } from "@/lib/site-config";
import { quoteOfDay, siteDays } from "@/lib/auth-quotes";

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

    const appName = config?.APP_NAME ?? "博客";
    const tagline = config?.SUB_TITLE || config?.SITE_DESCRIPTION || "";
    // 左栏的两句补充：今日一句（按日期固定）+ 建站天数（口径与关于页一致）
    const quote = quoteOfDay();
    const days = siteDays(config?.footer?.owner?.since);

    return (
        <html lang="zh-CN" suppressHydrationWarning data-skin={appearance.skinId}>
            <head>
                <style dangerouslySetInnerHTML={{ __html: appearance.css }} />
            </head>
            <body className="bg-background text-foreground">
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
                        {/* 编辑部风：左右分栏的纸张布局。左＝刊头（站名/导语/返回首页），右＝表单。
                            窄屏左栏隐藏、表单吃满宽度（品牌标识由 AuthCard 顶部的小 Logo 承担）。 */}
                        <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-6 py-12">
                            <div
                                aria-hidden="true"
                                className="pointer-events-none absolute -left-40 -top-40 size-[36rem] rounded-full bg-primary/5 blur-3xl"
                            />
                            <div className="relative z-10 grid w-full max-w-[880px] grid-cols-1 items-center gap-12 lg:grid-cols-[minmax(0,1fr)_360px]">
                                {/* 左：刊头 */}
                                <section className="hidden lg:block">
                                    <p className="font-mono text-[10px] tracking-[0.32em] text-muted-foreground uppercase">
                                        Ciraos · Blog
                                    </p>
                                    <h1 className="editorial-serif mt-2 text-5xl leading-none font-bold tracking-tight">
                                        {appName}
                                    </h1>
                                    {tagline && (
                                        <p className="mt-5 max-w-sm text-sm leading-relaxed text-muted-foreground">{tagline}</p>
                                    )}
                                    <div className="mt-7 h-px w-16 bg-primary" aria-hidden="true" />

                                    {/* 今日一句：按日期固定，不随机（SSR 与客户端一致） */}
                                    <p className="editorial-serif mt-7 max-w-sm text-[15px] leading-relaxed text-foreground/80">
                                        「{quote}」
                                    </p>

                                    <div className="mt-6 flex items-center gap-4 text-[11px] tracking-[0.12em] text-muted-foreground uppercase">
                                        {days !== null && <span>已开张 {days} 天</span>}
                                        <Link
                                            href="/"
                                            className="inline-flex items-center gap-1 transition-colors hover:text-primary"
                                        >
                                            ← 返回首页
                                        </Link>
                                    </div>

                                    {/* 门迎：站点吉祥物（public/mascot-dsh.png） */}
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src="/mascot-dsh-cutout.png"
                                        alt=""
                                        aria-hidden="true"
                                        className="mt-10 h-28 w-auto"
                                    />
                                </section>

                                {/* 右：表单面板（左侧一条发丝竖线，像书页的分栏） */}
                                <div className="flex w-full justify-center lg:justify-end lg:border-l lg:border-border/60 lg:pl-12">
                                    <AuthCard
                                        appName={appName}
                                        logoDay={config?.LOGO_HORIZONTAL_DAY || config?.LOGO_URL || "/favicon.ico"}
                                        logoNight={
                                            config?.LOGO_HORIZONTAL_NIGHT ||
                                            config?.LOGO_HORIZONTAL_DAY ||
                                            config?.LOGO_URL ||
                                            "/favicon.ico"
                                        }
                                    >
                                        {children}
                                    </AuthCard>
                                </div>
                            </div>

                            {/* 页脚：把备案号这类信息留在最底下，不抢表单的注意力 */}
                            {config?.ICP_NUMBER && (
                                <Link
                                    href="https://beian.miit.gov.cn"
                                    target="_blank"
                                    rel="noopener external nofollow noreferrer"
                                    className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[11px] text-muted-foreground/60 hover:underline"
                                >
                                    {config.ICP_NUMBER}
                                </Link>
                            )}
                        </div>
                    </div>
                </ThemeProvider>
            </body>
        </html>
    );
}
