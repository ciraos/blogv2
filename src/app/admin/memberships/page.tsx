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
                        会员方案（增删改）与会员列表（筛选 / 分页 / 详情）—— 数据来自后端 PRO 接口
                        /pro/admin/membership/*，经同源代理 /api/admin/membership/* 转发
                    </p>
                </div>
            </div>
            <MembershipsManager />
        </div>
    )
}
