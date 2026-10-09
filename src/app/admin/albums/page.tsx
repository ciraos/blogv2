import type { Metadata } from "next";
import { generateBlogMetadata } from "@/lib/seo";
import { AlbumManager } from "@/components/admin/album-manager";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("相册管理");
}

export default function Albums() {
    return (
        <div className="admin-page">
            <div className="admin-page-head">
                <div>
                    <h2 className="text-xl font-semibold tracking-tight">相册管理</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                        图片：按分类 / 标签筛选、按 URL 或文件（JSON / ZIP）导入、导出全部或选中项、编辑信息与批量删除；
                        分类：新建 / 编辑 / 删除
                    </p>
                </div>
            </div>
            <AlbumManager />
        </div>
    )
}
