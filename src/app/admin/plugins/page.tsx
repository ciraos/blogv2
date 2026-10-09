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
                        管理与扩展博客插件：查看已安装插件的状态 / 版本 / 能力，支持安装（上传 zip）、启用、停用、重载、
                        卸载与配置（按插件声明的 config_schema 动态渲染）。列表来自后端 /api/admin/plugins，
                        所有写操作均需二次确认。
                    </p>
                </div>
            </div>
            <PluginsManager />
        </div>
    )
}
