import type { Metadata } from "next";
import { generateBlogMetadata } from "@/lib/seo";
import { PluginsManager } from "@/components/admin/plugins-manager";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("插件管理");
}

export default function Plugins() {
    return (
        <div className="admin-page">
            <div className="admin-page-head">
                <div>
                    <h2 className="text-xl font-semibold tracking-tight">插件管理</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                        管理与扩展博客插件：查看已安装插件、启用状态与版本更新（接口接入前为静态外壳）
                    </p>
                </div>
            </div>
            <PluginsManager />
        </div>
    )
}
