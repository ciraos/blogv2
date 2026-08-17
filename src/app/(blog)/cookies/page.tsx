import type { Metadata } from "next";

import { getPublicPageApi } from "@/lib/api";
import { generateBlogMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("Cookie 政策");
}

/** Cookie 政策页：直接渲染 API 返回的 content（后端已渲染好的 HTML） */
export default async function Cookies() {
    let page: Awaited<ReturnType<typeof getPublicPageApi>> | null = null;
    try {
        page = await getPublicPageApi("/cookies");
    } catch (err) {
        console.error("[cookies] 获取页面失败:", err);
        page = null;
    }

    if (!page || !page.is_published) {
        return (
            <div className="w-full">
                <h1 className="text-2xl font-bold tracking-tight">Cookie 政策</h1>
                <p className="mt-4 text-sm text-muted-foreground">内容获取失败，请稍后再试。</p>
            </div>
        );
    }

    return (
        <div className="w-full">
            <header className="border-b pb-6">
                <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{page.title}</h1>
                {page.description && (
                    <p className="mt-2 text-sm text-muted-foreground">{page.description}</p>
                )}
            </header>

            {/* 后端渲染好的页面内容 HTML */}
            <div
                className="article-body mt-6"
                dangerouslySetInnerHTML={{ __html: page.content || "" }}
            />
        </div>
    );
}
