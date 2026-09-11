import type { Metadata } from "next";

import { ArticleList } from "@/components/admin/article-list";
import { generateBlogMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("文章管理");
}

export default function PostManagement() {
    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-2xl font-bold tracking-tight">文章管理</h2>
                <p className="text-slate-400 text-xs">管理文章，支持分类、标签、搜索与分页</p>
            </div>
            {/* 文章列表：按页拉取 /api/admin/articles */}
            <ArticleList />
        </div>
    );
}
