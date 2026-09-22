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

    if (!config) {
        return (
            <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
                读取站点配置失败：后端 /public/site-config 暂时不可用，稍后重试。
            </div>
        );
    }
    // 页面标题 / 分区标题都交给 SettingsManager 的壳（对齐官方：左侧导航 + 右侧面包屑标题）
    return <SettingsManager config={config} />;
}
