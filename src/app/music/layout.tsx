import "../globals.css";
import { ThemeProvider } from "@/components/ui/theme-provider";

export default function MusicLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    return (
        <html
            lang="zh-CN"
            suppressHydrationWarning
        >
            <body>
                <ThemeProvider
                    attribute="class"
                    defaultTheme="light"
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
