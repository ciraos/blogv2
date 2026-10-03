import type { Metadata } from "next";
import { generateBlogMetadata } from "@/lib/seo";
import { SupportsManager } from "@/components/admin/supports-manager";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("售后工单");
}

export default function Supports() {
    return (
        <div className="admin-page">
            <div className="admin-page-head">
                <div>
                    <h2 className="text-xl font-semibold tracking-tight">售后工单</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                        管理用户售后工单与会话（后端接口未接入，当前为静态外壳）：状态 / 类型 / 关键词筛选与查看会话、回复、关闭均为占位
                    </p>
                </div>
            </div>
            <SupportsManager />
        </div>
    )
}
