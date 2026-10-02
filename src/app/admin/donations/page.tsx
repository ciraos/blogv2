import type { Metadata } from "next";
import { generateBlogMetadata } from "@/lib/seo";
import { DonationsManager } from "@/components/admin/donations-manager";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("打赏管理");
}

export default function Donations() {
    return (
        <div className="admin-page">
            <div className="admin-page-head">
                <div>
                    <h2 className="text-xl font-semibold tracking-tight">打赏管理</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                        管理前台打赏名单（后端 PRO 接口），支持状态筛选、新增、编辑、删除与批量删除
                    </p>
                </div>
            </div>
            <DonationsManager />
        </div>
    )
}
