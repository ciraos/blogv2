import type { Metadata } from "next";
import { generateBlogMetadata } from "@/lib/seo";
import { PageManager } from "@/components/admin/page-manager";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("页面管理");
}

export default function PageManagement() {
    return (
        <div className="admin-page">
            <div className="admin-page-head">
                <div>
                    <h2 className="text-xl font-semibold tracking-tight">页面管理</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                        留言板、cookies、隐私协议、版权协议这类自定义页面：可搜索、按发布状态筛选、新建 / 编辑 / 删除
                    </p>
                </div>
            </div>
            <PageManager />
        </div>
    )
}
