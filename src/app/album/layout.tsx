import "../globals.css";
import { ThemeProvider } from "@/components/ui/theme-provider";
import { getSiteConfigs } from "@/lib/site-config";

export default async function AlbumLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    const config = await getSiteConfigs();
    return (
        <html lang="zh-CN" suppressHydrationWarning>
            <body>
                <ThemeProvider
                    attribute="class"
                    defaultTheme={config?.DEFAULT_THEME_MODE ?? "light"}
                    disableTransitionOnChange
                    enableSystem
                    enableColorScheme
                >
                    <div className="album-main">{children}</div>
                </ThemeProvider>
            </body>
        </html>
    )
}
