import type { Metadata } from "next";
import { generateBlogMetadata } from "@/lib/seo";
import { getSiteConfigs } from "@/lib/site-config";
import { QaManager } from "@/components/admin/qa-manager";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("社区问答");
}

/**
 * 导航菜单里找「留言板」页（自定义页面，路径由站点配置给出）。
 * 为什么这么找：本站前台没有 /qa，但通常有留言板这类带评论的自定义页，
 * 把它作为「问答页可以照抄的挂载方式」的实例链接；找不到就不显示。
 */
function findMessagePath(config: Awaited<ReturnType<typeof getSiteConfigs>>): string | null {
    const menu = config?.header?.menu ?? [];
    for (const group of menu) {
        for (const item of group.items ?? []) {
            if (item.isExternal) continue;
            if (!item.path?.startsWith("/")) continue;
            if (/message|留言|guestbook|qa|问答/i.test(`${item.path} ${item.title}`)) return item.path;
        }
    }
    return null;
}

export default async function CommunityQa() {
    // 只读站点公开配置：community_qa.enable 是后端真实存在的键（公开配置会返回该节点）。
    // 读不到就如实标注「读取失败」，不猜值、不造假数据。
    const config = await getSiteConfigs();

    return (
        // 不用 .admin-page：本页是多张卡片纵向堆叠的形状，滚动交给 main（卡片自然高度）
        <div className="flex flex-col gap-3">
            <div className="admin-page-head">
                <div>
                    <h2 className="text-xl font-semibold tracking-tight">社区问答</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                        后端没有问答管理接口，此页只做配置只读展示与「复用评论系统」的实现路径说明，不展示任何问答列表
                    </p>
                </div>
            </div>
            <QaManager
                qaEnable={config?.community_qa?.enable ?? null}
                configOk={config !== undefined}
                configMessage="读取站点公开配置失败（后端 /public/site-config 暂时不可用），当前值未知。"
                siteUrl={config?.SITE_URL ?? ""}
                messagePath={findMessagePath(config)}
            />
        </div>
    )
}
