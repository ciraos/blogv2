import type { Metadata } from "next";
import { generateBlogMetadata } from "@/lib/seo";
import { ThemesManager } from "@/components/admin/themes-manager";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("主题商城");
}

export default function Themes() {
    return (
        <div className="admin-page">
            <div className="admin-page-head">
                <div>
                    <h2 className="text-xl font-semibold tracking-tight">主题商城</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                        查看已安装主题与主题市场（官方 / 社区 / Pro、标准版与 SSR 版）并安装、应用、卸载
                        —— 静态外壳，接口接入后显示
                    </p>
                </div>
            </div>
            <ThemesManager />
        </div>
    )
}
