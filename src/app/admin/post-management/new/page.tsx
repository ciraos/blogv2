import type { Metadata } from "next";

import { ArticleForm } from "@/components/admin/article-form";
import { generateBlogMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("新增文章");
}

/**
 * /admin/post-management/new 新建文章（与 edit/[id] 共用 ArticleForm，仅 mode 不同）。
 * 外层用 fixed inset-0 铺满整个视口（对齐参照项目 anheyu-app-frontend 的
 * admin/post-management/new 做法）——这样编辑区占满整页，也不需要去改后台导航栏的收起行为。
 */
export default function NewArticlePage() {
    return (
        // flex + overflow-hidden：给里面的 .admin-page 一个确定高度，卡片才能内部滚动而不是溢出被裁
        <div className="article-editor-page fixed inset-0 z-[60] flex flex-col overflow-hidden bg-background">
            <ArticleForm mode="create" />
        </div>
    );
}
