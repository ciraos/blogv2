import "../globals.css";
import { ThemeProvider } from "@/components/ui/theme-provider";
import { getSiteConfigs } from "@/lib/site-config";

export default async function MusicLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    const config = await getSiteConfigs();
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
                    {/* 网易云「唱机」风格：深色背景 + 顶部栏 + 唱片 + 歌词 + 底部控制条 */}
                    <div className="music-main w-full min-h-dvh flex flex-col bg-[#16161a] text-white">{children}</div>
                </ThemeProvider>
            </body>
        </html>
    )
}
