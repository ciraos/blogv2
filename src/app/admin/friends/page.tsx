import type { Metadata } from "next";
import { generateBlogMetadata } from "@/lib/seo";

import {
    Button
} from "@/components/ui/button";
import {
    FolderDownIcon,
    FolderOutputIcon,
    HeartPulse,
    PlusIcon,
    TagIcon
} from "lucide-react";
import { FriendsManager } from "@/components/admin/friends-manager";
import { CategorySortDialog } from "@/components/admin/category-sort-dialog";

export function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("友链管理")
};

export default function AdminFriends() {
    return (
        <>
            <div className="flex items-center justify-between space-y-1">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">友链管理</h2>
                    <p className="text-slate-400 text-xs">管理友情链接，支持分类、标签和健康检查</p>
                </div>
                <div className="flex items-center">
                    <Button>
                        <PlusIcon size={4} />
                        新建友链
                    </Button>
                    <Button>
                        <TagIcon size={4} />
                        分类标签
                    </Button>
                    {/* 分类展示顺序拖拽排序（保存到 localStorage，前台 /link 页生效） */}
                    <CategorySortDialog />
                    <Button>
                        <FolderDownIcon size={4} />
                        导入
                    </Button>
                    <Button>
                        <FolderOutputIcon size={4} />
                        导出
                    </Button>
                    <Button>
                        <HeartPulse size={4} />
                        健康检查
                    </Button>
                </div>
            </div>

            {/* 筛选工具栏 + 友链表格（搜索/状态/分类/标签筛选、全选、分页） */}
            <div className="mt-4">
                <FriendsManager />
            </div>
        </>
    )
}
