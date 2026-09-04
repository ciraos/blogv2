import type { Metadata } from 'next';
import Link from 'next/link';
import "./globals.css";

import { BackButton } from "@/components/back-button";
import { SiteConfigResponse } from "@/types/site-config";

const site_url = process.env.NEXT_PUBLIC_SITE_URL;
const api_url = process.env.NEXT_PUBLIC_API_URL;

export async function generateMetadata(): Promise<Metadata> {
    try {
        const a = await fetch(`${api_url}/public/site-config`);
        const data: SiteConfigResponse = await a.json();
        // apple-touch-icon：动态引用后端 logo（PNG 优先），无本地静态文件
        const appleIcon = site_url + (data.data.LOGO_URL_192x192 || data.data.LOGO_URL || data.data.ICON_URL);
        return {
            icons: {
                icon: site_url + data.data.ICON_URL,
                apple: appleIcon,
            },
            title: data.data.APP_NAME + " | 页面未找到"
        };
    } catch {
        return { title: "页面未找到" };
    }
}

export default function NotFound() {
    return (
        <div className="relative flex min-h-[calc(100dvh-10rem)] w-full flex-col items-center justify-center gap-7 overflow-hidden py-16 text-center">
            {/* 背景装饰：漂浮圆点 + 模糊光斑 */}
            <div className="pointer-events-none absolute inset-0" aria-hidden="true">
                <span className="nf-dot left-[10%] top-[18%] size-2.5 bg-primary/40" />
                <span className="nf-dot left-[85%] top-[24%] size-2 bg-primary/30" style={{ animationDelay: "-1.2s" }} />
                <span className="nf-dot left-[16%] top-[72%] size-2 bg-primary/30" style={{ animationDelay: "-2.5s" }} />
                <span className="nf-dot left-[82%] top-[70%] size-3 bg-primary/25" style={{ animationDelay: "-3.8s" }} />
                <span className="nf-dot left-[52%] top-[10%] size-1.5 bg-primary/30" style={{ animationDelay: "-0.6s" }} />
                <span className="absolute -left-24 top-20 size-72 rounded-full bg-primary/10 blur-3xl" />
                <span className="absolute -right-24 bottom-16 size-64 rounded-full bg-primary/5 blur-3xl" />
            </div>

            {/* 404 渐变大字 */}
            <div className="relative select-none bg-gradient-to-b from-foreground via-foreground to-muted-foreground bg-clip-text text-[6.5rem] font-black leading-none tracking-tight text-transparent md:text-[9rem]">
                404
            </div>

            {/* CSS 幽灵（会漂浮） */}
            <div className="nf-ghost relative" aria-hidden="true">
                <span className="absolute left-[26px] top-[46px] size-3.5 rounded-full bg-foreground" />
                <span className="absolute right-[26px] top-[46px] size-3.5 rounded-full bg-foreground" />
                <span className="absolute left-[33px] top-[61px] size-2.5 rounded-full bg-pink-300/80" />
                <span className="absolute right-[33px] top-[61px] size-2.5 rounded-full bg-pink-300/80" />
                <span className="absolute left-1/2 top-[80px] h-2 w-7 -translate-x-1/2 rounded-b-full border-b-2 border-foreground" />
            </div>

            {/* 文案 */}
            <div className="relative space-y-2">
                <h2 className="text-2xl font-bold tracking-tight">页面走丢了</h2>
                <p className="text-sm text-muted-foreground">
                    你访问的页面不存在或已被移除，去看看别的内容吧。
                </p>
            </div>

            {/* 按钮 */}
            <div className="relative mt-1 flex flex-wrap justify-center gap-3">
                <Link
                    href="/"
                    className="inline-flex items-center rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
                >
                    返回首页
                </Link>
                <Link
                    href="/archives"
                    className="inline-flex items-center rounded-lg border px-5 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
                >
                    查看文章
                </Link>
                <BackButton />
            </div>
        </div>
    );
}
