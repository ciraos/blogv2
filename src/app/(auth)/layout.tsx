import type { Metadata } from "next";
import "../globals.css";
import { AuthCard } from "@/components/(auth)/auth-card";
import { ThemeProvider } from "@/components/ui/theme-provider";
import { resolveAppearance } from "@/lib/appearance";
import { getSiteConfigs } from "@/lib/site-config";
import { SiteConfigResponse } from "@/types/site-config";

const site_url = process.env.NEXT_PUBLIC_SITE_URL;
const api_url = process.env.NEXT_PUBLIC_API_URL;

export async function generateMetadata(): Promise<Metadata> {
    const a = await fetch(`${api_url}/public/site-config`);
    const data: SiteConfigResponse = await a.json();
    // console.log(site_url + data.data.ICON_URL);
    // apple-touch-icon：动态引用后端 logo（PNG 优先），无本地静态文件
    const appleIcon = site_url + (data.data.LOGO_URL_192x192 || data.data.LOGO_URL || data.data.ICON_URL);
    return {
        icons: {
            icon: site_url + data.data.ICON_URL,
            apple: appleIcon,
        },
    };
}

export default async function AuthLayout({ children }: Readonly<{ children: React.ReactNode; }>) {
    const config = await getSiteConfigs();
    // 站点外观：按后端 APPEARANCE_SKIN / APPEARANCE_TOKENS 生成皮肤变量（浅/深各一套），
    // 与 (blog)/admin 两个 layout 一致。这里以前漏了注入，导致 --primary 退回 globals.css 的
    // 近黑色默认值 —— 登录/注册按钮用的是 bg-primary，所以显示不出主题色。
    const appearance = resolveAppearance(config?.APPEARANCE_SKIN, config?.APPEARANCE_TOKENS);

    return (
        <html lang="zh-CN" suppressHydrationWarning data-skin={appearance.skinId}>
            <head>
                <style dangerouslySetInnerHTML={{ __html: appearance.css }} />
            </head>
            <body className="">

                <ThemeProvider
                    attribute="class"
                    defaultTheme={config?.DEFAULT_THEME_MODE ?? "light"}
                    disableTransitionOnChange
                    enableSystem
                    enableColorScheme
                >
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
