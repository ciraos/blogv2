import type { Metadata } from "next";
import { generateBlogMetadata } from "@/lib/seo";
import { PageManager } from "@/components/admin/page-manager";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("页面管理");
}

export default function PageManagement() {
    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-2xl font-bold tracking-tight">页面管理</h2>
                <p className="text-sm text-muted-foreground">
                    留言板、cookies、隐私协议、版权协议这类自定义页面：可搜索、按发布状态筛选、新建 / 编辑 / 删除
                </p>
            </div>
            <PageManager />
        </div>
    )
}
