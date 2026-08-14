import type { Metadata } from 'next';
import Link from 'next/link';

import { SiteConfigResponse } from "@/types/site-config";

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
        <div className="flex min-h-[60vh] w-full flex-col items-center justify-center gap-6 py-20 text-center">
            <div className="select-none text-[7rem] font-black leading-none tracking-tight text-primary/15 md:text-[9rem]">
                404
            </div>

            <div className="space-y-2">
                <h2 className="text-2xl font-bold tracking-tight">页面走丢了</h2>
                <p className="text-sm text-muted-foreground">
                    你访问的页面不存在或已被移除，去看看别的内容吧。
                </p>
            </div>

            <div className="mt-2 flex flex-wrap justify-center gap-3">
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
            </div>
        </div>
    );
}
