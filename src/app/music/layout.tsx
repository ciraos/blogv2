import "../globals.css";
import Header from "@/components/header";
import { AuthExpiredNotifier } from "@/components/(blog)/auth-expired-notifier";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/ui/theme-provider";
import { ThemeScheduleSync } from "@/components/ui/theme-schedule-sync";
import { TopProgress } from "@/components/ui/top-progress";
import { getHeaderData } from "@/lib/header-data";
import { getSiteConfigs } from "@/lib/site-config";
import { resolveThemeSchedule } from "@/lib/scheduled-theme";

export default async function MusicLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    const config = await getSiteConfigs();
    // 与 (blog) 共用同一个 Header 及其取数逻辑（登录态 / 导航菜单 / 搜索 / 用户菜单）
    const { header, authExpired } = await getHeaderData(config);
    // 定时主题（DEFAULT_THEME_MODE = "auto"）：本页容器强制深色，但仍同步一份状态给 Header 等元素
    const schedule = resolveThemeSchedule(config);
    return (
        <html
            lang="zh-CN"
            suppressHydrationWarning
        >
            <body>
                <ThemeProvider
                    attribute="class"
                    defaultTheme={schedule.initial}
                    disableTransitionOnChange
                    enableSystem
                    enableColorScheme
                >
                    {/* 顶部进度条：与 (blog) 一致，覆盖软导航那段反馈 */}
                    <TopProgress />

                    {/* 定时主题：auto 时按两个时段自动切换（不占 DOM） */}
                    <ThemeScheduleSync schedule={schedule} />

                    {/* 音乐馆：全屏、禁止整页滚动（滚动交给歌词区）。
                        与参照项目 (music)/music-layout.css 一致：layout 是 flex 纵向列、高度锁 100dvh、overflow hidden。
                        主题：**跟随站点配置**（含 DEFAULT_THEME_MODE = "auto" 的定时切换）——
                        之前这里写死 `dark` 且底色 #16161a / 文字白色，导致本页永远深色；
                        现在用 --background/--foreground，深浅色由 API 配置决定，播放器样式见 music.module.css。 */}
                    <div className="flex h-dvh max-h-dvh min-h-dvh w-full flex-col overflow-hidden overscroll-none bg-background text-foreground">
                        <div className="shrink-0">
                            <Header {...header} />
                        </div>
                        {children}
                    </div>
                </ThemeProvider>
                {/* Header 的用户菜单/登录过期提示会用到 toast */}
                <Toaster position="top-right" richColors closeButton />
                <AuthExpiredNotifier expired={authExpired} />
            </body>
        </html>
    )
}
