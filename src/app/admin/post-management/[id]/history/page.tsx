import type { Metadata } from "next";

import { ArticleHistory } from "@/components/admin/article-history";
import { generateBlogMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("历史版本");
}

/**
 * /admin/post-management/[id]/history 文章历史版本页。
 * 与编辑页一致：外层 fixed inset-0 flex flex-col overflow-hidden 铺满整个视口
 * （对齐参照项目 article-history 路由的 fixed inset-0 z-100 做法）。
 */
export default async function ArticleHistoryPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return (
        <div className="fixed inset-0 z-[60] flex flex-col overflow-hidden bg-background">
            <ArticleHistory articleId={id} />
        </div>
    );
}
