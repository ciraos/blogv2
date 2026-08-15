import type { Metadata } from "next";
import Link from "next/link";
import "../globals.css";
import { ThemeProvider } from "@/components/ui/theme-provider";
import Header from "@/components/header";
// import Aside from "@/components/aside";

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

export default async function BlogLayout({ children }: Readonly<{ children: React.ReactNode; }>) {
  const config = await getSiteConfigs();

  return (
    <html data-theme="light" lang="zh-CN" suppressHydrationWarning>
      <body className="">

        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          disableTransitionOnChange
          enableSystem
          enableColorScheme
        >
          {/* flex 列布局 + min-h-dvh：内容不足一屏时 footer 吸附在视口底部 */}
          <div id="CIRAOS" className="flex min-h-dvh flex-col">
            <Header menu={config?.header?.menu ?? []} appName={config?.APP_NAME ?? "博客"} />

            <div className="main w-full max-w-300 mx-auto mt-10 px-4 sm:px-0 flex flex-1">
              {children}
            </div>

            <div id="footer" className="footer w-full max-w-300 mx-auto mt-15 px-4 sm:px-0">
              <Link href="https://beian.miit.gov.cn" target="_blank" rel="noopener external nofollow noreferrer" className="flex items-center justify-center hover:underline">{config?.ICP_NUMBER}</Link>
            </div>

          </div>
        </ThemeProvider>

      </body>
    </html>
  );
}
