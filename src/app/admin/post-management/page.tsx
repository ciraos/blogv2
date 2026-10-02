import type { Metadata } from "next";

import { ArticleList } from "@/components/admin/article-list";
import { generateBlogMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("文章管理");
}

export default function PostManagement() {
    return (
        <div className="admin-page">
            <div className="admin-page-head">
                <div>
                    <h2 className="text-xl font-semibold tracking-tight">文章管理</h2>
                    <p className="mt-1 text-xs text-muted-foreground">管理文章，支持分类、标签、搜索与分页</p>
                </div>
            </div>
            {/* 文章列表：按页拉取 /api/admin/articles（表格在卡片内部滚动） */}
            <ArticleList />
        </div>
    );
}
