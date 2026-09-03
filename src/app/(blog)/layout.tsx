import type { Metadata } from "next";
import Link from "next/link";
import { cookies, headers } from "next/headers";
import "../globals.css";
import { ThemeProvider } from "@/components/ui/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import Header from "@/components/header";
import { FloatingActions } from "@/components/(blog)/floating-actions";
import { AuthExpiredNotifier } from "@/components/(blog)/auth-expired-notifier";
import { FooterRandomLinks } from "@/components/(blog)/footer-random-links";
import { FooterSocialBar } from "@/components/(blog)/footer-social-bar";
import { OneImageHero } from "@/components/(blog)/one-image-hero";
import { ScrollToTop } from "@/components/(blog)/scroll-to-top";
// import Aside from "@/components/aside";

import { getPublicLinksRandomApi, getAllPublicArticlesApi, getPublicArchivesApi, getUserInfoApi } from "@/lib/api";
import { collectTags } from "@/lib/articles";
import { SiteConfigResponse } from "@/types/site-config";
import { BlogSidebar } from "@/components/(blog)/blog-sidebar";

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

export default async function BlogLayout({ children }: Readonly<{ children: React.ReactNode; }>) {
  const config = await getSiteConfigs();
  // httpOnly token 由服务端读取，判断登录态传给 Header
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  const isLoggedIn = !!token;

  // 已登录时获取用户信息（头像等），传给 Header 显示圆形头像。
  // token 过期/无效（401）：标记 authExpired，由客户端组件静默登出并提示
  let userAvatar: string | null = null;
  let authExpired = false;
  if (token) {
    try {
      const userInfo = await getUserInfoApi(token);
      userAvatar = userInfo.avatar || null;
    } catch (error) {
      // 注：不依赖 instanceof ApiError（RSC/浏览器边界类引用可能缺失），直接读 status
      const status = (error as { status?: number } | null)?.status ?? 0;
      if (status === 401) {
        authExpired = true;
      } else {
        console.error("获取用户信息失败", error);
      }
    }
  }

  // 文章详情页：目录（TOC）移入全局侧边栏顶部，正文不再单独双栏
  const headerList = await headers();
  const pathname = headerList.get("x-pathname") ?? "";
  // 关于页：内容自带丰富布局（头像/技能/信息），不显示全局侧边栏
  const isAbout = pathname === "/about";

  // 页脚随机友链：数量取配置 footer.list.randomFriends（默认 3）
  const randomFriendsCount = config?.footer?.list?.randomFriends ?? 3;
  let randomLinks: Awaited<ReturnType<typeof getPublicLinksRandomApi>> = [];
  try {
    randomLinks = await getPublicLinksRandomApi(randomFriendsCount);
  } catch (error) {
    console.error("获取页脚随机友链失败", error);
  }

  // 移动端汉堡菜单：标签云（取全部文章聚合，前 12 个）
  let mobileTags: { id: string; name: string; count: number }[] = [];
  try {
    const articles = await getAllPublicArticlesApi();
    mobileTags = collectTags(articles).slice(0, 12);
  } catch (error) {
    console.error("获取标签失败", error);
  }

  // 移动端汉堡菜单：网站信息（与侧边栏一致：文章数/字数/建站天数）
  const siteinfo = config?.sidebar?.siteinfo;
  let siteCreatedAt: string | undefined;
  try {
    const archive = await getPublicArchivesApi();
    const list = archive.list ?? [];
    if (list.length > 0) {
      const first = list[list.length - 1]; // 接口按时间倒序，最后一条最早
      siteCreatedAt = `${first.year}-${String(first.month).padStart(2, "0")}-01T00:00:00Z`;
    }
  } catch (error) {
    console.error("获取归档失败", error);
  }

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
          <Toaster position="top-right" richColors closeButton />

          {/* 全局：路由切换时回到顶部（修复跨页面滚动位置残留） */}
          <ScrollToTop />

          {/* Token 过期：静默登出并提示（不占 DOM） */}
          <AuthExpiredNotifier expired={authExpired} />

          {/* flex 列布局 + min-h-dvh：内容不足一屏时 footer 吸附在视口底部 */}
          <div id="CIRAOS" className="flex min-h-dvh flex-col">
            <Header
              menu={config?.header?.menu ?? []}
              appName={config?.APP_NAME ?? "博客"}
              isLoggedIn={isLoggedIn}
              userpanel={config?.userpanel}
              userAvatar={userAvatar}
              mobileTags={mobileTags}
              siteinfo={siteinfo}
              siteCreatedAt={siteCreatedAt}
              oneImage={config?.page?.one_image}
            />

            {/* 页面顶部大图（OneImage）：home/archives/tags/categories 各自 enable 控制；
                header 透明悬浮其上，滚动离开首屏后恢复 */}
            <OneImageHero oneImage={config?.page?.one_image} appName={config?.APP_NAME ?? "博客"} />

            <div className="main w-full max-w-300 mx-auto mt-10 px-4 sm:px-0 flex flex-1 gap-6">
              {/* 主体内容区（container query 容器：收缩侧边栏时撑满，网格列数随宽度自适应） */}
              <div className="min-w-0 flex-1 @container/main">{children}</div>

              {/* 右侧边栏（300px，桌面端显示；移动端隐藏；关于页不显示） */}
              {!isAbout && <BlogSidebar config={config} />}
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
                                    className="text-sm text-muted-foreground transition-colors hover:text-primary"
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
        </ThemeProvider>

      </body>
    </html>
  );
}
