import type { Metadata } from "next";
import { generateBlogMetadata } from "@/lib/seo";
import { AlbumManager } from "@/components/admin/album-manager";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("相册管理");
}

export default function Albums() {
    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-2xl font-bold tracking-tight">相册管理</h2>
                <p className="text-sm text-muted-foreground">
                    图片：按分类 / 标签筛选、按 URL 批量导入、编辑信息与批量删除；分类：新建 / 编辑 / 删除
                </p>
            </div>
            <AlbumManager />
        </div>
    )
}
