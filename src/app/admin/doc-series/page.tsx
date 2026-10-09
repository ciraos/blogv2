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
                        新增 / 编辑 / 删除文档系列（名称、简介、封面、排序），并可查看与调整系列下的文章
                    </p>
                </div>
            </div>
            <DocSeriesManager />
        </div>
    )
}
