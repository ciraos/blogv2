import type { Metadata } from "next";
import { generateBlogMetadata } from "@/lib/seo";
import { MomentManager } from "@/components/admin/moment-manager";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("朋友圈管理");
}

export default function Moments() {
    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-2xl font-bold tracking-tight">朋友圈管理</h2>
                <p className="text-sm text-muted-foreground">
                    友链 RSS 聚合出的朋友圈文章：可搜索、按友链筛选、按发布时间 / 入库时间 / 抓取时间排序，支持触发抓取、清理缓存与增删改
                </p>
            </div>
            <MomentManager />
        </div>
    )
}
