import type { Metadata } from "next";

import { SettingsManager } from "@/components/admin/settings-manager";
import { generateBlogMetadata } from "@/lib/seo";
import { getFreshSiteConfigs } from "@/lib/site-config";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("系统设置");
}

export default async function Settings() {
    // 首屏值实时读公开站点配置（不吃 Next 数据缓存，保存后刷新才能立刻看到新值）
    const config = await getFreshSiteConfigs();

    if (!config) {
        return (
            <div className="soft-surface p-6 text-sm text-muted-foreground">
                读取站点配置失败：后端 /public/site-config 暂时不可用，稍后重试。
            </div>
        );
    }
    // 页面标题 / 分区标题都交给 SettingsManager 的壳（对齐官方：左侧导航 + 右侧面包屑标题）
    return <SettingsManager config={config} />;
}
