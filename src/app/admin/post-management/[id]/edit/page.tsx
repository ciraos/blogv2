import type { Metadata } from "next";

import { ArticleForm } from "@/components/admin/article-form";
import { generateBlogMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("编辑文章");
}

/**
 * /admin/post-management/[id]/edit 编辑文章（与 new 共用 ArticleForm，仅 mode 不同）。
 * 路由形状对齐参照项目 anheyu-app-frontend（new 与 [id]/edit、[id]/history 同一套）。
 * 外层 fixed inset-0 flex flex-col overflow-hidden：给里面的 .admin-page 确定高度，
 * 让编辑器占满整页且卡片内部滚动（不只是 fixed，否则内容会溢出被裁）。
 */
export default async function EditArticlePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return (
        <div className="fixed inset-0 z-[60] flex flex-col overflow-hidden bg-background">
            <ArticleForm mode="edit" articleId={id} />
        </div>
    );
}
