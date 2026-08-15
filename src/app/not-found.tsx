import type { Metadata } from 'next';
import Link from 'next/link';

import { BackButton } from "@/components/back-button";
import { SiteConfigResponse } from "@/types/site-config";
import { Compass } from "lucide-react";

const site_url = process.env.NEXT_PUBLIC_SITE_URL;
const api_url = process.env.NEXT_PUBLIC_API_URL;

export async function generateMetadata(): Promise<Metadata> {
    try {
        const a = await fetch(`${api_url}/public/site-config`);
        const data: SiteConfigResponse = await a.json();
        return {
            icons: site_url + data.data.ICON_URL,
            title: data.data.APP_NAME + " | 页面未找到"
        };
    } catch {
        return { title: "页面未找到" };
    }
}

export default function NotFound() {
    return (
        <div className="relative flex min-h-[calc(100dvh-10rem)] w-full flex-col items-center justify-center gap-7 overflow-hidden py-16 text-center">
            {/* 装饰性模糊色块 */}
            <div className="pointer-events-none absolute -left-24 top-16 size-64 rounded-full bg-primary/10 blur-3xl" />
            <div className="pointer-events-none absolute -right-20 bottom-10 size-56 rounded-full bg-primary/5 blur-3xl" />

            <div className="relative">
                {/* 图标方块 */}
                <div className="mx-auto flex size-20 items-center justify-center rounded-3xl border bg-card text-primary shadow-sm">
                    <Compass className="size-10" />
                </div>

                {/* 渐变大字 */}
                <div className="mt-6 select-none bg-gradient-to-b from-foreground via-foreground to-muted-foreground bg-clip-text text-[7rem] font-black leading-none tracking-tight text-transparent md:text-[9rem]">
                    404
                </div>

                {/* 小标 */}
                <div className="mt-2 text-xs font-medium uppercase tracking-[0.35em] text-muted-foreground">
                    Not Found
                </div>
            </div>

            <div className="relative space-y-2">
                <h2 className="text-2xl font-bold tracking-tight">页面走丢了</h2>
                <p className="text-sm text-muted-foreground">
                    你访问的页面不存在或已被移除，去看看别的内容吧。
                </p>
            </div>

            <div className="relative mt-2 flex flex-wrap justify-center gap-3">
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
