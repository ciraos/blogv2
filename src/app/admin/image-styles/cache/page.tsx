import type { Metadata } from "next";
import { generateBlogMetadata } from "@/lib/seo";
import { ImageStylesManager } from "@/components/admin/image-styles-manager";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("图片样式缓存");
}

// 侧边栏「图片样式缓存」指向本路由（app-sidebar.tsx:98）。
// 实现只写一份：@/components/admin/image-styles-manager（/admin/image-styles 也复用它）。
// 旧的静态外壳组件 image-style-cache-manager.tsx 已删除（无任何引用）。
export default function ImageStylesCache() {
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
