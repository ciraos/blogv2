import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PostComments } from "@/components/(blog)/post-comments";
import { getCommentsWithChildrenApi, getPublicPageApi } from "@/lib/api";
import { getCommentAuthor } from "@/lib/comment-author";
import { generateBlogMetadata } from "@/lib/seo";

// 自定义页面内容来自后端实时数据（后台随时新建/改标题），不做构建期静态预渲染
export const dynamic = "force-dynamic";

/** URL 路径段 → 后端页面 path（["message"] → "/message"；["a","b"] → "/a/b"） */
function toPagePath(slug: string[]): string {
    return `/${slug.map((segment) => decodeURIComponent(segment)).join("/")}`;
}

interface CustomPageProps {
    params: Promise<{ slug: string[] }>;
}

/**
 * 自定义页面兜底路由：渲染后台「页面管理」里新建的页面（后端 GET /public/pages/{path}）。
 *
 * 例：后台建了 path=/message 的页面 → 访问 /message 就能看到（本地 dev 与线上部署后一致）。
 *
 * 几点口径说明：
 * - 具体路由优先于本兜底路由（App Router 的 static > dynamic > catch-all），
 *   所以 /privacy、/categories、/posts/[id] 等既有页面不受影响；
 * - 未发布（is_published=false）或后端查不到 → 真 404，与 privacy/cookies/copyright 一致；
 * - 自定义页面按官方对照表「不挂侧边栏」，此文件不套 PageWithSidebar 即为正确行为；
 * - show_comment 为真时挂评论区，target_path 用页面自身 path（后台评论管理可按该路径筛选）。
 */
export async function generateMetadata({ params }: CustomPageProps): Promise<Metadata> {
    const { slug } = await params;
    try {
        const page = await getPublicPageApi(toPagePath(slug));
        if (page?.is_published) {
            return generateBlogMetadata(page.title);
        }
    } catch {
        // 查不到就退回站点默认标题（页面本身随后会 404）
    }
    return generateBlogMetadata();
}

export default async function CustomPage({ params }: CustomPageProps) {
    const { slug } = await params;
    const path = toPagePath(slug);

    let page: Awaited<ReturnType<typeof getPublicPageApi>> | null = null;
    try {
        page = await getPublicPageApi(path);
    } catch {
        page = null;
    }

    // 拉取失败或未发布 → 404
    if (!page || !page.is_published) {
        notFound();
    }

    // show_comment 为真才挂评论区
    let comments: Awaited<ReturnType<typeof getCommentsWithChildrenApi>> = [];
    if (page.show_comment) {
        try {
            comments = await getCommentsWithChildrenApi(page.path);
        } catch {
            // 忽略，评论区显示空态
        }
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
            <div className="article-body mt-6" dangerouslySetInnerHTML={{ __html: page.content || "" }} />

            {page.show_comment && (
                <PostComments
                    targetPath={page.path}
                    comments={comments}
                    author={await getCommentAuthor()}
                />
            )}
        </div>
    );
}
