import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import "../globals.css";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarTriggerFallback } from "@/components/sidebar-trigger-fallback";
import { SidebarProvider } from "@/components/ui/sidebar";
import { ThemeProvider } from "@/components/ui/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { ThemeScheduleSync } from "@/components/ui/theme-schedule-sync";
import { TopProgress } from "@/components/ui/top-progress";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApiError, getUserInfoApi } from "@/lib/api";
import { resolveAssetUrl } from "@/lib/utils";
import { resolveAppearance } from "@/lib/appearance";
import { resolveThemeSchedule } from "@/lib/scheduled-theme";
import { isAdminUser } from "@/lib/auth";
import { SiteConfigResponse } from "@/types/site-config";

const site_url = process.env.NEXT_PUBLIC_SITE_URL;
const api_url = process.env.NEXT_PUBLIC_API_URL;

export async function generateMetadata(): Promise<Metadata> {
    // 站点配置接口抖一下不该把整个后台打成 500：失败就退回本地默认图标
    const fallbackIcon = "/favicon.ico";
    try {
        const res = await fetch(`${api_url}/public/site-config`);
        if (!res.ok) throw new Error(`获取配置失败：HTTP ${res.status}`);
        const data = (await res.json()) as SiteConfigResponse;
        const icon = data?.data?.ICON_URL;
        // apple-touch-icon：动态引用后端 logo（PNG 优先），无可用值时退回默认图标
        const appleIcon = data?.data?.LOGO_URL_192x192 || data?.data?.LOGO_URL || icon;
        return {
            icons: {
                icon: icon ? site_url + icon : fallbackIcon,
                apple: appleIcon ? site_url + appleIcon : fallbackIcon,
            },
        };
    } catch (error) {
        console.error("[admin] 生成 metadata 时读取站点配置失败，已退回默认图标：", error);
        return { icons: { icon: fallbackIcon, apple: fallbackIcon } };
    }
}

export async function getSiteConfigs() {
    try {
        const i = await fetch(`${api_url}/public/site-config`);
        if (!i.ok) throw new Error("获取配置失败！");
        const data = (await i.json()) as SiteConfigResponse;
        // console.log(data);
        return data.data;
    } catch (error) {
        console.error(error);
        // 兜底：至少让侧边栏有站点名与图标，避免整块空白（调用方全部用了可选链，兜底对象是安全子集）
        return { APP_NAME: "博客", ICON_URL: "/favicon.ico" } as SiteConfigResponse["data"];
    }
}

export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode; }>) {
    const config = await getSiteConfigs();
    // 站点外观：按后端 APPEARANCE_SKIN / APPEARANCE_TOKENS 生成主题变量（浅/深各一套）
    const appearance = resolveAppearance(config?.APPEARANCE_SKIN, config?.APPEARANCE_TOKENS);
    // 定时主题（DEFAULT_THEME_MODE = "auto"）：SSR 首帧按服务器时钟，客户端由 ThemeScheduleSync 校正
    const schedule = resolveThemeSchedule(config);

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

    // 角色守卫：非管理员直接跳回主页（与官方后台 router.replace("/") 行为一致，不再显示无权限提示页）
    if (!isAdminUser(user)) redirect("/");

    return (
        <html lang="zh-CN" suppressHydrationWarning data-skin={appearance.skinId}>
            <head>
                <style dangerouslySetInnerHTML={{ __html: appearance.css }} />
            </head>
            <body>
                <ThemeProvider
                    attribute="class"
                    defaultTheme={schedule.initial}
                    disableTransitionOnChange
                    enableSystem
                    enableColorScheme
                >
                    <Toaster position="top-right" richColors closeButton />
                    {/* 顶部进度条：后台页面之间的软导航反馈 */}
                    <TopProgress />
                    {/* 定时主题：auto 时按两个时段自动切换（不占 DOM） */}
                    <ThemeScheduleSync schedule={schedule} />
                    <TooltipProvider>
                        {/* 整页锁 100dvh 且不滚动：滚动交给内容区（以及列表页内部的表格区域） */}
                        <SidebarProvider className="h-dvh overflow-hidden">
                            <AppSidebar user={navUser} />
                            <main className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-2 overflow-y-auto px-5 py-1.5">
                                <SidebarTriggerFallback />
                                {/* 内容区是 flex 列。注意这里**不能**给所有页面根节点加 min-h-0/flex-auto：
                                    那会把「内容比视口高」的页面（仪表盘、设置页、占位页）压到视口高度，
                                    它们内部的 absolute 装饰层与 main 里 shrink-0 的页脚就会叠在一起。
                                    需要「表格自己滚」的列表页由 .admin-page 自己声明可压缩（见 globals.css）。 */}
                                <div className="dsh-main flex min-h-0 flex-1 flex-col">
                                    {children}
                                    {/* 页脚排在内容之后、且不额外占高：页面根只吃「扣掉页脚」的剩余高度，
                                        所以列表页不会出现整页滚动条，页脚就落在卡片正下方。压薄到 h-8 把高度让给表格。 */}
                                    <footer className="mt-2 flex h-8 shrink-0 items-center justify-center gap-3 border-t">
                                        <Link href="https://beian.miit.gov.cn" target="_blank" rel="noopener external nofollow noreferrer" className="text-xs text-muted-foreground hover:underline">{config?.ICP_NUMBER}</Link>
                                        {/* 版本号只保留侧边栏那一份（用户要求：侧边已有，页脚不再重复） */}
                                    </footer>
                                </div>
                            </main>
                        </SidebarProvider>
                    </TooltipProvider>
                </ThemeProvider>
            </body>
        </html>
    );
}
