import type { Metadata } from "next";
import { generateBlogMetadata } from "@/lib/seo";
import { getSiteConfigs } from "@/lib/site-config";
import { QaManager } from "@/components/admin/qa-manager";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("社区问答");
}

export default async function CommunityQa() {
    // 只读站点公开配置：community_qa.enable 是后端真实存在的键（公开配置会返回该节点），
    // 作为开关的初值；客户端再用管理端接口 GET /pro/admin/community-qa/config 确认。
    // 读不到就如实标注「读取失败」，不猜值、不造假数据。
    const config = await getSiteConfigs();

    return (
        // 不用 .admin-page：本页是多张卡片纵向堆叠的形状，滚动交给 main（卡片自然高度）
        <div className="flex flex-col gap-3">
            <div className="admin-page-head">
                <div>
                    <h2 className="text-xl font-semibold tracking-tight">社区问答管理</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                        公开阅读、登录参与，问题与回答需审核后公开。列表 / 审核 / 开关全部走真实接口（PRO 模块）
                    </p>
                </div>
            </div>
            <QaManager
                initialEnabled={config?.community_qa?.enable ?? null}
                configOk={config !== undefined}
                siteUrl={config?.SITE_URL ?? ""}
            />
        </div>
    )
}
