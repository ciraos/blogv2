import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import "../globals.css";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeProvider } from "@/components/ui/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApiError, getUserInfoApi } from "@/lib/api";
import { resolveAssetUrl } from "@/lib/utils";
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

    // 读取登录 token，获取当前登录用户信息（proxy 已拦截未登录，这里兜底）
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) redirect("/login");

    let user;
    try {
        user = await getUserInfoApi(token);
    } catch (err) {
        // token 失效 → 走登出路由清 cookie 再回登录页
        if (err instanceof ApiError && err.status === 401) {
            redirect("/api/auth/logout");
        }
        throw err;
    }

    const navUser = {
        name: user.nickname || user.username,
        email: user.email,
        avatar: resolveAssetUrl(user.avatar) ?? "",
    };

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
                    <Toaster position="top-right" richColors closeButton />
                    <TooltipProvider>
                        <SidebarProvider>
                            <AppSidebar user={navUser} />
                            <main className="flex min-h-screen w-full flex-1 min-w-0 flex-col py-2 px-5">
                                <SidebarTrigger />
                                <div className="dsh-main flex-1 space-y-6">{children}</div>
                                <footer className="mt-auto flex h-14 shrink-0 items-center justify-center border-t">
                                    <Link href="https://beian.miit.gov.cn" target="_blank" rel="noopener external nofollow noreferrer" className="text-xs text-muted-foreground hover:underline">{config?.ICP_NUMBER}</Link>
                                </footer>
                            </main>
                        </SidebarProvider>
                    </TooltipProvider>

                </ThemeProvider>

            </body>
        </html>
    );
}
