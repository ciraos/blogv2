import type { Metadata } from "next";
import { generateBlogMetadata } from "@/lib/seo";
import { CacheManager } from "@/components/admin/cache-manager";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("缓存管理");
}

export default function CacheManagement() {
    return (
        <div className="admin-page">
            <div className="admin-page-head">
                <div>
                    <h2 className="text-xl font-semibold tracking-tight">缓存管理</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                        查看页面 / 图片 / 索引等缓存的可用性与统计，并执行重新验证与清理（均需二次确认）
                    </p>
                </div>
            </div>
            <CacheManager />
        </div>
    )
}
