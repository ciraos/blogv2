import type { Metadata } from "next";
import Link from "next/link";
import "../globals.css";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeProvider } from "@/components/ui/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";

import { SiteConfigResponse } from "@/types/site-config";

const site_url = process.env.NEXT_PUBLIC_SITE_URL;
const api_url = process.env.NEXT_PUBLIC_API_URL;

export async function generateMetadata(): Promise<Metadata> {
    const a = await fetch(`${api_url}/public/site-config`);
    const data: SiteConfigResponse = await a.json();
    // console.log(site_url + data.data.ICON_URL);
    return {
        icons: site_url + data.data.ICON_URL
    };
}

export async function getSiteConfigs() {
    try {
        const i = await fetch(`${api_url}/public/site-config`);
        if (!i.ok) throw new Error("获取配置失败！");
        const data = (await i.json()) as SiteConfigResponse;
        // console.log(data);
        return data.data;
    } catch (error) {
        // return { APP_NAME: "博客", ICON_URL: "/favicon.ico", error };
        console.error(error);
    }
}

export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode; }>) {
    const config = await getSiteConfigs();

    return (
        <html data-theme="light" lang="zh-CN" suppressHydrationWarning>
            <body>

                <ThemeProvider
                    attribute="class"
                    defaultTheme="light"
                    disableTransitionOnChange
                    enableSystem
                    enableColorScheme
                >
                    <TooltipProvider>
                        <SidebarProvider>
                            <AppSidebar />
                            <main className="py-2 px-5">
                                <SidebarTrigger />
                                {children}
                                <Link href="https://beian.miit.gov.cn" target="_blank" rel="noopener external nofollow noreferrer" className="w-full flex items-center justify-center hover:underline">{config?.ICP_NUMBER}</Link>
                            </main>
                        </SidebarProvider>
                    </TooltipProvider>

                </ThemeProvider>

            </body>
        </html>
    );
}
