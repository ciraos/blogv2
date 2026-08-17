import Link from "next/link";
import { redirect } from "next/navigation";
import { Shuffle } from "lucide-react";

import { getPublicLinksRandomApi } from "@/lib/api";

// 每次请求都实时取随机友链并跳转，不做构建期预渲染
export const dynamic = "force-dynamic";

export default async function TravellingPage() {
    let url: string | null = null;

    try {
        const links = await getPublicLinksRandomApi(1);
        url = links[0]?.url ?? null;
    } catch {
        url = null;
    }

    // 取到随机友链 → 直接跳转到博主网站
    if (url) {
        redirect(url.startsWith("http") ? url : `https://${url}`);
    }

    // 兜底：获取失败时展示重试入口
    return (
        <div className="flex min-h-[50vh] w-full flex-col items-center justify-center gap-5 py-16 text-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Shuffle className="size-7" />
            </div>
            <div className="space-y-1.5">
                <h1 className="text-xl font-bold tracking-tight">随机友链获取失败</h1>
                <p className="text-sm text-muted-foreground">暂时无法跳转到宝藏博主，请稍后再试。</p>
            </div>
            <div className="flex flex-wrap justify-center gap-3">
                <Link
                    href="/travelling"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
                >
                    <Shuffle className="size-4" />
                    再试一次
                </Link>
                <Link
                    href="/link"
                    className="inline-flex items-center rounded-lg border px-5 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
                >
                    查看全部友链
                </Link>
            </div>
        </div>
    );
}
