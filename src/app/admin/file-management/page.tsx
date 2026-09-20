import type { Metadata } from "next";
import { generateBlogMetadata } from "@/lib/seo";
import { FileManager } from "@/components/admin/file-manager";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("文件管理");
}

export default function FileManagement() {
    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-2xl font-bold tracking-tight">文件管理</h2>
                <p className="text-sm text-muted-foreground">浏览「我的文件」：文件夹可逐级进入，文件可查看详情与复制直链</p>
            </div>
            <FileManager />
        </div>
    )
}
