import type { Metadata } from "next";
import { generateBlogMetadata } from "@/lib/seo";
import { SeoPushManager } from "@/components/admin/seo-push-manager";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("SEO推送");
}

export default function SeoPush() {
    return (
        // 注意：这里【不用】 .admin-page —— 那个类把页面根锁成内容区高度（表格页专用）。
        // 本页是「多张卡片纵向堆叠」的形状，应该由 main 正常滚动，卡片自己有多高就多高。
        <div className="flex flex-col gap-3">
            <div className="admin-page-head">
                <div>
                    <h2 className="text-xl font-semibold tracking-tight">SEO 推送</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                        后端未提供推送接口（社区版）：此页展示百度推送配置说明、本地 SEO 体检清单与站长平台入口
                    </p>
                </div>
            </div>
            <SeoPushManager />
        </div>
    )
}
