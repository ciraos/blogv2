import type { Metadata } from "next";
import { generateBlogMetadata } from "@/lib/seo";

import { FriendsManager } from "@/components/admin/friends-manager";
import { LinkCreateButton } from "@/components/admin/link-create-button";
import { LinkExportButton } from "@/components/admin/link-export-button";
import { LinkHealthCheckButton } from "@/components/admin/link-health-check-button";
import { LinkImportDialog } from "@/components/admin/link-import-dialog";
import { LinkTaxonomyDialog } from "@/components/admin/link-taxonomy-dialog";

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
                    {/* 分类 / 标签的新增、改名、删除（后端 /links/categories、/links/tags 的写接口） */}
                    <LinkTaxonomyDialog />
                    {/* 导入 / 导出：远端 /links/import、/links/export，两者格式同构，导出文件可直接回灌 */}
                    <LinkImportDialog />
                    <LinkExportButton />
                    <LinkHealthCheckButton />
                </div>
            </div>

            {/* 筛选工具栏 + 友链表格（搜索/状态/分类/标签筛选、全选、分页），已收进同一张 admin-card */}
            <FriendsManager />
        </div>
    )
}
