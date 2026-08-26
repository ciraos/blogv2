import "../globals.css";
import { ThemeProvider } from "@/components/ui/theme-provider";

export default function AlbumLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    return (
        <html
            data-theme="light"
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
                    <div className="album-main">{children}</div>
                </ThemeProvider>
            </body>
        </html>
    )
}
