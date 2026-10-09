import type { Metadata } from "next";
import { generateBlogMetadata } from "@/lib/seo";
import { ImageStylesManager } from "@/components/admin/image-styles-manager";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("图片样式缓存");
}

// /admin/image-styles：与 /admin/image-styles/cache 同一份实现（侧边栏当前指向 cache 那条）。
// 两条路由都留着，是为了让任务指定的路径与既有导航都能直达，避免动 app-sidebar.tsx。
export default function ImageStyles() {
    return (
        <div className="admin-page">
            <div className="admin-page-head">
                <div>
                    <h2 className="text-xl font-semibold tracking-tight">图片样式缓存</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                        按存储策略查看/编辑命名样式与自动压缩，查看派生缓存统计，并可重新生成缩略图、按目录批量重新生成、清理图片缓存
                    </p>
                </div>
            </div>
            <ImageStylesManager />
        </div>
    )
}
