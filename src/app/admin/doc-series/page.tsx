import type { Metadata } from "next";
import { generateBlogMetadata } from "@/lib/seo";
import { DocSeriesManager } from "@/components/admin/doc-series-manager";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("文档系列");
}

export default function DocSeries() {
    return (
        <div className="admin-page">
            <div className="admin-page-head">
                <div>
                    <h2 className="text-xl font-semibold tracking-tight">文档系列</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                        管理文档系列（封面、简介、排序与收录文档），接口接入前为静态外壳
                    </p>
                </div>
            </div>
            <DocSeriesManager />
        </div>
    )
}
