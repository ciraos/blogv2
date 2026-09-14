import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getCommentsWithChildrenApi, getPublicPageApi } from "@/lib/api";
import { generateBlogMetadata } from "@/lib/seo";
import { PostComments } from "@/components/(blog)/post-comments";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("版权声明");
}

/** 版权声明页：内容来自 /public/pages/copyright；未发布返回 404；show_comment 为真则显示评论 */
export default async function Copyright() {
    let page: Awaited<ReturnType<typeof getPublicPageApi>> | null = null;
    try {
        page = await getPublicPageApi("/copyright");
    } catch (err) {
        console.error("[copyright] 获取页面失败:", err);
        page = null;
    }

    // 拉取失败或未发布 → 真 404（对应 is_published=false）
    if (!page || !page.is_published) {
        notFound();
    }

    // show_comment 为真才挂评论区：target_path 用页面自身路径（如 /copyright）
    let comments: Awaited<ReturnType<typeof getCommentsWithChildrenApi>> = [];
    if (page.show_comment) {
        comments = await getCommentsWithChildrenApi(page.path);
    }

    return (
        <div className="w-full">
            <header className="border-b pb-6">
                <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{page.title}</h1>
                {page.description && (
                    <p className="mt-2 text-sm text-muted-foreground">{page.description}</p>
                )}
            </header>

            {/* 后端渲染好了的页面内容 HTML */}
            <div
                className="article-body mt-6"
                dangerouslySetInnerHTML={{ __html: page.content || "" }}
            />

            {page.show_comment && <PostComments targetPath={page.path} comments={comments} />}
        </div>
    );
}
