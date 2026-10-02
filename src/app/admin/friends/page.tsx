import type { Metadata } from "next";
import { generateBlogMetadata } from "@/lib/seo";

import {
    Button
} from "@/components/ui/button";
import {
    FolderDownIcon,
    FolderOutputIcon,
    TagIcon
} from "lucide-react";
import { FriendsManager } from "@/components/admin/friends-manager";
import { LinkCreateButton } from "@/components/admin/link-create-button";
import { LinkHealthCheckButton } from "@/components/admin/link-health-check-button";
import { CategorySortDialog } from "@/components/admin/category-sort-dialog";

export function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("友链管理")
};

export default function Friends() {
    return (
        <div className="admin-page">
            <div className="admin-page-head">
                <div>
                    <h2 className="text-xl font-semibold tracking-tight">友链管理</h2>
                    <p className="mt-1 text-xs text-muted-foreground">管理友情链接，支持分类、标签和健康检查</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <LinkCreateButton />
                    <Button variant="outline">
                        <TagIcon size={4} />
                        分类标签
                    </Button>
                    {/* 分类展示顺序拖拽排序（保存到 localStorage，前台 /link 页生效） */}
                    <CategorySortDialog />
                    <Button variant="outline">
                        <FolderDownIcon size={4} />
                        导入
                    </Button>
                    <Button variant="outline">
                        <FolderOutputIcon size={4} />
                        导出
                    </Button>
                    <LinkHealthCheckButton />
                </div>
            </div>

            {/* 筛选工具栏 + 友链表格（搜索/状态/分类/标签筛选、全选、分页），已收进同一张 admin-card */}
            <FriendsManager />
        </div>
    )
}
