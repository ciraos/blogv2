import type { Metadata } from "next";
import { generateBlogMetadata } from "@/lib/seo";
import { ImageStyleCacheManager } from "@/components/admin/image-style-cache-manager";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("图片样式缓存");
}

export default function ImageStylesCache() {
    return (
        <div className="admin-page">
            <div className="admin-page-head">
                <div>
                    <h2 className="text-xl font-semibold tracking-tight">图片样式缓存</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                        查看与管理缩略图缓存文件：按目录 / 格式 / 尺寸筛选，支持重新生成与清理（接口接入前为静态外壳）
                    </p>
                </div>
            </div>
            <ImageStyleCacheManager />
        </div>
    )
}
