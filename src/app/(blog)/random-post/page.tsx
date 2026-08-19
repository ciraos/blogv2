import Link from "next/link";
import { redirect } from "next/navigation";
import { Shuffle } from "lucide-react";

import { getRandomArticleApi } from "@/lib/api";

// 每次请求都实时随机，不做构建期预渲染
export const dynamic = "force-dynamic";

export default async function RandomPost() {
    let id: string | null = null;

    try {
        const article = await getRandomArticleApi();
        id = article.id ?? null;
    } catch {
        id = null;
    }

    // 取到随机文章 → 直接跳转到文章详情页
    if (id) {
        redirect(`/posts/${id}`);
    }

    // 兜底：无文章时展示入口
    return (
        <div className="flex min-h-[50vh] w-full flex-col items-center justify-center gap-5 py-16 text-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Shuffle className="size-7" />
            </div>
            <div className="space-y-1.5">
                <h1 className="text-xl font-bold tracking-tight">暂时没有文章可逛</h1>
                <p className="text-sm text-muted-foreground">等博主发布文章后再来随便逛逛吧。</p>
            </div>
            <div className="flex flex-wrap justify-center gap-3">
                <Link
                    href="/random-post"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
                >
                    <Shuffle className="size-4" />
                    再试一次
                </Link>
                <Link
                    href="/"
                    className="inline-flex items-center rounded-lg border px-5 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
                >
                    返回首页
                </Link>
            </div>
        </div>
    );
}
