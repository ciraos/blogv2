import type { Metadata } from "next";
import { generateBlogMetadata } from "@/lib/seo";
import { StorageManager } from "@/components/admin/storage-manager";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("存储策略");
}

export default function Storage() {
    return (
        <div className="admin-page">
            <div className="admin-page-head">
                <div>
                    <h2 className="text-xl font-semibold tracking-tight">存储策略</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                        管理文章图片 / 评论图片 / 用户头像的存储位置（本机与 OneDrive、腾讯云 COS、阿里云 OSS、AWS S3 等云存储）
                        —— 静态外壳，接口接入后显示
                    </p>
                </div>
            </div>
            <StorageManager />
        </div>
    )
}
