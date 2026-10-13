import type { Metadata } from "next";

import { PageForm } from "@/components/admin/page-form";
import { generateBlogMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("编辑页面");
}

/**
 * /admin/page-management/[id]/edit 编辑自定义页面（与 new 共用 PageForm，仅 mode 不同）。
 * 路由形状对齐 /admin/post-management/[id]/edit；外层同样 fixed inset-0 + flex 列，
 * 给 .admin-page 确定高度，让卡片内部滚动（只 fixed 会让内容溢出被裁）。
 */
export default async function EditAdminPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return (
        <div className="fixed inset-0 z-[60] flex flex-col overflow-hidden bg-background">
            <PageForm mode="edit" pageId={id} />
        </div>
    );
}
