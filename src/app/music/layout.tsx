import "../globals.css";
import Header from "@/components/header";
import { AuthExpiredNotifier } from "@/components/(blog)/auth-expired-notifier";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/ui/theme-provider";
import { getHeaderData } from "@/lib/header-data";
import { getSiteConfigs } from "@/lib/site-config";

export default async function MusicLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    const config = await getSiteConfigs();
    // 与 (blog) 共用同一个 Header 及其取数逻辑（登录态 / 导航菜单 / 搜索 / 用户菜单）
    const { header, authExpired } = await getHeaderData(config);
    return (
        <html
            lang="zh-CN"
            suppressHydrationWarning
        >
            <body>
                <ThemeProvider
                    attribute="class"
                    defaultTheme={config?.DEFAULT_THEME_MODE ?? "light"}
                    disableTransitionOnChange
                    enableSystem
                    enableColorScheme
                >
                    {/* 音乐馆：全屏深色 + 禁止整页滚动（滚动交给歌词区）。
                        与参照项目 (music)/music-layout.css 一致：layout 是 flex 纵向列、
                        高度锁 100dvh、overflow hidden。
                        这里额外加 `dark`：本页不管站点主题都按深色渲染，Header 的胶囊颜色
                        走的是主题令牌（bg-card），加了 dark 才会是深色胶囊而不是白胶囊。 */}
                    <div className="dark flex h-dvh max-h-dvh min-h-dvh w-full flex-col overflow-hidden overscroll-none bg-[#16161a] text-white">
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
