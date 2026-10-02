import type { Metadata } from "next";
import { generateBlogMetadata } from "@/lib/seo";
import { EssaysManager } from "@/components/admin/essays-manager";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("说说管理");
}

export default function Essays() {
    return (
        <div className="admin-page">
            <div className="admin-page-head">
                <div>
                    <h2 className="text-xl font-semibold tracking-tight">说说管理</h2>
                    <p className="mt-1 text-xs text-muted-foreground">管理后台说说（即刻），支持筛选、编辑与删除</p>
                </div>
            </div>
            <EssaysManager />
        </div>
    )
}
