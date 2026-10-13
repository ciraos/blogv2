import type { Metadata } from "next";

import { PageForm } from "@/components/admin/page-form";
import { generateBlogMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("新增页面");
}

/**
 * /admin/page-management/new 新增自定义页面（与 [id]/edit 共用 PageForm，仅 mode 不同）。
 * 外层 fixed inset-0 铺满整个视口（与文章编辑器 /admin/post-management/new 完全同构）：
 * 编辑区占满整页，也不必去改后台导航栏的收起行为。
 * flex + overflow-hidden：给里面的 .admin-page 一个确定高度，卡片才能内部滚动而不是溢出被裁。
 */
export default function NewAdminPage() {
    return (
        <div className="fixed inset-0 z-[60] flex flex-col overflow-hidden bg-background">
            <PageForm mode="create" />
        </div>
    );
}
