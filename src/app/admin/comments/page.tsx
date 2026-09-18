import type { Metadata } from "next";
import { generateBlogMetadata } from "@/lib/seo";
import { CommentsManager } from "@/components/admin/comments-manager";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("评论管理");
}

export default function Comments() {
    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-2xl font-bold tracking-tight">评论管理</h2>
                <p className="text-sm text-muted-foreground">支持昵称 / 邮箱 / 内容 / 路径 / 状态筛选，可审核、置顶、编辑与删除评论</p>
            </div>
            <CommentsManager />
        </div>
    )
}
