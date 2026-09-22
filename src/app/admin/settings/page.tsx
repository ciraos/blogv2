import type { Metadata } from "next";

import { SettingsManager } from "@/components/admin/settings-manager";
import { generateBlogMetadata } from "@/lib/seo";
import { getSiteConfigs } from "@/lib/site-config";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("系统设置");
}

export default async function Settings() {
    // 首屏值直接取公开的站点配置（与前台读的是同一份），保存走 /api/admin/settings/update
    const config = await getSiteConfigs();

    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-2xl font-bold tracking-tight">系统设置</h2>
                <p className="text-sm text-muted-foreground">
                    站点信息、Logo 与图标、外观换肤与页脚；只提交改动项，保存后立即生效（刷新前台即可看到）
                </p>
            </div>
            {config ? (
                <SettingsManager config={config} />
            ) : (
                <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
                    读取站点配置失败：后端 /public/site-config 暂时不可用，稍后重试。
                </div>
            )}
        </div>
    );
}
