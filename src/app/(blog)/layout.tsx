import type { Metadata } from "next";
import Link from "next/link";
import "../globals.css";
import { ThemeProvider } from "@/components/ui/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { ThemeScheduleSync } from "@/components/ui/theme-schedule-sync";
import { TopProgress } from "@/components/ui/top-progress";
import Header from "@/components/header";
import { FloatingActions } from "@/components/(blog)/floating-actions";
import { AuthExpiredNotifier } from "@/components/(blog)/auth-expired-notifier";
import { FooterRandomLinks } from "@/components/(blog)/footer-random-links";
import { FooterSocialBar } from "@/components/(blog)/footer-social-bar";
import { GravatarProvider } from "@/components/(blog)/gravatar-provider";
import { LiveRefresher } from "@/components/(blog)/live-refresher";
import { OneImageHero } from "@/components/(blog)/one-image-hero";
import { ScrollToTop } from "@/components/(blog)/scroll-to-top";
import { SidebarCollapseProvider } from "@/components/(blog)/sidebar-collapse-provider";
// import Aside from "@/components/aside";

import { getPublicLinksRandomApi } from "@/lib/api";
import { resolveAppearance } from "@/lib/appearance";
import { resolveThemeSchedule } from "@/lib/scheduled-theme";
import { getHeaderData } from "@/lib/header-data";
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

export default async function BlogLayout({ children }: Readonly<{ children: React.ReactNode; }>) {
  const config = await getSiteConfigs();
  // 站点外观：按后端 APPEARANCE_SKIN / APPEARANCE_TOKENS 生成主题变量（浅/深各一套）
  const appearance = resolveAppearance(config?.APPEARANCE_SKIN, config?.APPEARANCE_TOKENS);
  // 定时主题（后端 DEFAULT_THEME_MODE = "auto"）：SSR 首帧先按服务器时钟定一个，
  // 客户端挂载后由 ThemeScheduleSync 按访客本地时间校正并接管到下一个时段边界。
  const schedule = resolveThemeSchedule(config);
  // Header 的全部数据（登录态/用户信息/移动端菜单的标签云与建站天数）抽在 getHeaderData 里，
  // 与 music layout 共用；authExpired 用于 token 过期的静默登出提示。
  const { header, authExpired } = await getHeaderData(config);

  // 页脚随机友链：数量取配置 footer.list.randomFriends（默认 3）
  const randomFriendsCount = config?.footer?.list?.randomFriends ?? 3;
  let randomLinks: Awaited<ReturnType<typeof getPublicLinksRandomApi>> = [];
  try {
    randomLinks = await getPublicLinksRandomApi(randomFriendsCount);
  } catch (error) {
    console.error("获取页脚随机友链失败", error);
  }

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

          {/* 顶部进度条：软导航（点链接 → RSC 回来之前）的反馈 */}
          <TopProgress />

          {/* 定时主题：auto 时按 THEME_LIGHT_START_TIME / THEME_DARK_START_TIME 自动切换（不占 DOM） */}
          <ThemeScheduleSync schedule={schedule} />

          {/* 全局：路由切换时回到顶部（修复跨页面滚动位置残留） */}
          <ScrollToTop />

          {/* Token 过期：静默登出并提示（不占 DOM） */}
          <AuthExpiredNotifier expired={authExpired} />

          {/* 后台改了站点配置 → 同一浏览器的前台标签页自动刷新；外加定时/唤醒兜底刷新内容（不占 DOM） */}
          <LiveRefresher />

          {/* 侧边栏收缩状态：前台右侧边栏（CollapsibleAside）与右下角悬浮按钮共用同一份状态 */}
          <SidebarCollapseProvider>
            {/* flex 列布局 + min-h-dvh：内容不足一屏时 footer 吸附在视口底部 */}
            <div id="CIRAOS" className="flex min-h-dvh flex-col">
              <Header {...header} />

              {/* 页面顶部大图（OneImage）：home/archives/tags/categories 各自 enable 控制；
                  header 透明悬浮其上，滚动离开首屏后恢复 */}
              <OneImageHero oneImage={config?.page?.one_image} appName={config?.APP_NAME ?? "博客"} />

              {/* 页面容器：只负责居中 / 最大宽度 / 内边距。
                  右侧边栏改由「页面」按需渲染（对齐官方做法，见 components/(blog)/page-with-sidebar.tsx） */}
              <div className="main w-full max-w-300 mx-auto mt-10 px-4 sm:px-0 flex-1">
                {/* 头像配置下发：评论区 / 评论列表据此拼 Gravatar（GRAVATAR_URL + DEFAULT_GRAVATAR_TYPE），
                    用 layout 已经取到的 site-config，客户端不必再请求一次，也不会先渲染错头像再替换 */}
                <GravatarProvider value={{ url: config?.GRAVATAR_URL, defaultType: config?.DEFAULT_GRAVATAR_TYPE }}>
                  {children}
                </GravatarProvider>
              </div>

              {/* footer 外层全宽：整页背景模式下承载 footer 背景色与顶部渐隐带（铺满屏幕），
                  非 hero 页无 .one-image-footer-fade 时等同透明，不影响常规布局 */}
              <div id="footer" className="footer relative mt-15 w-full">
                <div className="mx-auto w-full max-w-300 px-4 sm:px-0">
                  {/* 页脚社交栏：左右社交图标 + 中间头像（config.footer.socialBar），位于页脚顶部 */}
                  <FooterSocialBar
                    left={config?.footer?.socialBar?.left}
                    right={config?.footer?.socialBar?.right}
                    centerImg={config?.footer?.socialBar?.centerImg}
                  />
                  <div className="footer-project">
                    {config?.footer?.project?.list?.length ? (
                      <div className="grid grid-cols-2 gap-6 pt-0 sm:grid-cols-4">
                        {config.footer.project.list.map((group) => (
                          <div key={group.title}>
                            <h3 className="mb-3 text-sm font-semibold">{group.title}</h3>
                            <ul className="space-y-2">
                              {group.links.map((item) => {
                                const isExternal = item.link.startsWith("http");
                                return (
                                  <li key={item.title}>
                                    <Link
                                      href={item.link}
                                      {...(isExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                                      className="rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-primary hover:text-primary-foreground"
                                    >
                                      {item.title}
                                    </Link>
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        ))}
                        <FooterRandomLinks initialLinks={randomLinks} count={randomFriendsCount} />
                      </div>
                    ) : null}
                  </div>
                  <Link href="https://beian.miit.gov.cn" target="_blank" rel="noopener external nofollow noreferrer" className="mt-6 flex items-center justify-center hover:underline">{config?.ICP_NUMBER}</Link>
                </div>
              </div>
            </div>
            {/* (blog) 全局右下角悬浮按钮组：外层展开 → 目录（仅文章页）+ 回到顶部 */}
            <FloatingActions />
          </SidebarCollapseProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
