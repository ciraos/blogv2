import type { Metadata } from "next";
import Link from "next/link";
import { MegaphoneIcon } from "lucide-react";
import "../globals.css";
import { ThemeProvider } from "@/components/ui/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { ThemeScheduleSync } from "@/components/ui/theme-schedule-sync";
import { TopProgress } from "@/components/ui/top-progress";
import Header from "@/components/header";
import { ConfirmProvider } from "@/components/confirm-provider";
import { FloatingActions } from "@/components/(blog)/floating-actions";
import { AiPodcastButton } from "@/components/(blog)/ai-podcast-button";
import { MiniMusicPlayer } from "@/components/(blog)/mini-music-player";
import { AiAssistantLauncher } from "@/components/(blog)/ai-assistant-launcher";
import { AuthExpiredNotifier } from "@/components/(blog)/auth-expired-notifier";
import { FooterBadges } from "@/components/(blog)/footer-badges";
import { FooterBottomBar } from "@/components/(blog)/footer-bottom-bar";
import { FooterCustomText } from "@/components/(blog)/footer-custom-text";
import { FooterRandomLinks } from "@/components/(blog)/footer-random-links";
import { FooterRuntime } from "@/components/(blog)/footer-runtime";
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
import { JsonLd } from "@/components/(blog)/json-ld";
import { websiteSchema } from "@/lib/structured-data";
import { resolveAssetUrl } from "@/lib/utils";
import { getSiteConfigs, resolveSiteIcons } from "@/lib/site-config";

export async function generateMetadata(): Promise<Metadata> {
  // 与整页共用同一份站点配置（lib/site-config.ts 用 React cache 做了同请求去重），不再单独 fetch
  const config = await getSiteConfigs();
  const icons = resolveSiteIcons(config);
  return {
    icons: {
      icon: icons.icon,
      apple: icons.apple,
    },
  };
}

/**
 * 首次访问就默认收起右侧边栏的页面（数组必须是**模块级常量**：
 * 内联写在 JSX 里每次渲染都是新引用，会触发 Provider 里 effect 反复重跑）。
 */
const SIDEBAR_DEFAULT_COLLAPSED_PATHS = ["/equipment"] as const;

/** 站点公告条（SITE_ANNOUNCEMENT）：后端定义（internal/configdef/definition.go 第 54 行）为
 *  「站点公告（HTML 片段），展示在导航栏下方；留空不显示」，所以固定渲染在 header 之后、
 *  首屏大图/正文之前，通栏铺满；空值（trim 后）整条不渲染。
 *
 *  为什么是 relative z-10：header 是 sticky 的（z-50），公告条自己不能进 sticky 区域；
 *  而首屏大图（OneImageHero）用 `-mt-14` 顶到 header 之下、背景是 z-0 的 fixed 图，
 *  这里提 z-index（与 globals.css 里 `body:has(.one-image-hero) .main{z-index:1}` 同一手法）
 *  才能稳稳压在背景图之上，而不是被大图盖住。半透明 + backdrop-blur 让它在有大图的页面
 *  是一层毛玻璃，在普通页面则是一层浅色底，深浅色都由主题令牌决定。 */
function AnnouncementBar({ html }: { html?: string }) {
  const value = html?.trim();
  if (!value) return null;

  return (
    <div className="relative z-10 w-full border-y border-border/60 bg-muted/70 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-300 items-start gap-2 px-4 py-2.5 text-sm text-foreground/90 sm:px-0">
        <MegaphoneIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        {/* 后台配置的 HTML 片段，官方口径直出（同 footer.custom_text） */}
        <div
          className="min-w-0 leading-relaxed [&_a]:text-primary [&_a]:underline"
          dangerouslySetInnerHTML={{ __html: value }}
        />
      </div>
    </div>
  );
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
      <body className="bg-background text-foreground">
        <ThemeProvider
          attribute="class"
          defaultTheme={schedule.initial}
          disableTransitionOnChange
          enableSystem
          enableColorScheme
        >
          <Toaster position="top-right" richColors closeButton />

          {/* 站点级结构化数据：WebSite + 站内搜索动作（全站一次即可，搜索引擎据此生成搜索框） */}
          <JsonLd
            data={websiteSchema({
              name: config?.APP_NAME ?? "博客",
              url: config?.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || "",
              description: config?.SUB_TITLE || config?.SITE_DESCRIPTION || undefined,
              logo: resolveAssetUrl(config?.LOGO_URL || config?.ICON_URL) ?? undefined,
            })}
          />

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

          {/* 应用内确认弹窗：前台目前只有用户中心的「退出登录」用到（替代 window.confirm）。
              只做 Provider 包裹，不动下面的布局逻辑。 */}
          <ConfirmProvider>
            {/* 侧边栏收缩状态：前台右侧边栏（CollapsibleAside）与右下角悬浮按钮共用同一份状态。
                defaultCollapsedPaths：这些页面「本地没有记录时」默认收起（目前只有装备页，卡片区需要更宽） */}
            <SidebarCollapseProvider defaultCollapsedPaths={SIDEBAR_DEFAULT_COLLAPSED_PATHS}>
              {/* flex 列布局 + min-h-dvh：内容不足一屏时 footer 吸附在视口底部 */}
              <div id="CIRAOS" className="flex min-h-dvh flex-col">
                <Header {...header} />

                {/* 站点公告条（SITE_ANNOUNCEMENT）：导航正下方的通栏条，位于首屏大图/正文之前 */}
                <AnnouncementBar html={config?.SITE_ANNOUNCEMENT} />

                {/* 页面顶部大图（OneImage）：home/archives/tags/categories 各自 enable 控制；
                  header 透明悬浮其上，滚动离开首屏后恢复 */}
                <OneImageHero oneImage={config?.page?.one_image} appName={config?.APP_NAME ?? "博客"} />

                {/* 页面容器：只负责居中 / 最大宽度 / 内边距。
                  右侧边栏改由「页面」按需渲染（对齐官方做法，见 components/(blog)/page-with-sidebar.tsx） */}
                <div className="main w-full max-w-[960px] mx-auto mt-10 px-4 sm:px-0 flex-1">
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
                    {/* 运行时间（footer.runtime）+ 自定义文案（footer.custom_text）：
                      官方 footer.pug 里这两块就排在社交栏之后、项目链接之前 */}
                    <FooterRuntime config={config?.footer?.runtime} />
                    <FooterCustomText text={config?.footer?.custom_text} />
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
                    {/* 徽章（footer.badge，官方排在项目链接之后） */}
                    <FooterBadges config={config?.footer?.badge} />
                  </div>
                  {/* 页脚底栏（通栏，自己铺满宽度）：©年份 · 站长 / 备案 + 运行状态 → 右侧底栏链接 + CC 协议。
                    对齐官方主题 Blog Footer 的 Bottom Bar，配色走主题令牌，深浅色自适应。 */}
                  <FooterBottomBar
                    owner={config?.footer?.owner}
                    bar={config?.footer?.bar}
                    icpNumber={config?.ICP_NUMBER}
                    policeRecordNumber={config?.POLICE_RECORD_NUMBER}
                    policeRecordIcon={config?.POLICE_RECORD_ICON}
                    kuma={config?.footer?.uptime_kuma}
                  />
                </div>

              </div>

              {/* (blog) 全局右下角悬浮按钮组：外层展开 → 目录（仅文章页）+ 回到顶部 */}
              <FloatingActions />

              {/* 左下角一列（从上到下）：AI 播客 → AI 助手 → 迷你音乐播放器（gap-2）。
                三者都拆掉各自的 fixed 定位，由这层容器统一锚定，避免各自算偏移量对不齐。
                · AI 播客只在文章详情页渲染（组件内部按 /posts/{id} 判断）
                · AI 助手在 ai_assistant.enable = false 时内部返回 null
                · 播放器没有歌单时内部返回 null */}
              <div className="fixed bottom-5 left-5 z-50 flex flex-col items-start gap-2">
                <AiPodcastButton
                  enable={config?.ai_podcast?.enable}
                  buttonText={config?.ai_podcast?.button_text}
                  buttonIcon={config?.ai_podcast?.button_icon}
                />
                <AiAssistantLauncher
                  embedded
                  enabled={config?.ai_assistant?.enable}
                  name={config?.ai_assistant?.name}
                  welcome={config?.ai_assistant?.welcome}
                  chatSuggestions={config?.ai_assistant?.chat_suggestions}
                  searchSuggestions={config?.ai_assistant?.search_suggestions}
                />
                {/* 迷你音乐播放器：歌单来自后端 /public/music/playlist（后台 music.player.*） */}
                <MiniMusicPlayer embedded />
              </div>

            </SidebarCollapseProvider>

          </ConfirmProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
