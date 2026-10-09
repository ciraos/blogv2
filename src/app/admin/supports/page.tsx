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
                        用户售后工单与会话：状态 / 类型 / 关键词筛选，查看会话、回复、关闭、改状态、删除
                        —— 数据来自后端 PRO 接口 /pro/admin/support/*，经同源代理 /api/admin/support/* 转发
                    </p>
                </div>
            </div>
            <SupportsManager />
        </div>
    )
}
