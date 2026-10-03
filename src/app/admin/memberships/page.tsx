import type { Metadata } from "next";
import { generateBlogMetadata } from "@/lib/seo";
import { MembershipsManager } from "@/components/admin/memberships-manager";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("会员管理");
}

export default function MemberShips() {
    return (
        <div className="admin-page">
            <div className="admin-page-head">
                <div>
                    <h2 className="text-xl font-semibold tracking-tight">会员管理</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                        会员方案与会员列表（后端接口尚未找到，当前为静态外壳：不发请求，按钮均为占位）
                    </p>
                </div>
            </div>
            <MembershipsManager />
        </div>
    )
}
