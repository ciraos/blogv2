import type { Metadata } from "next";
import { generateBlogMetadata } from "@/lib/seo";
import { SeoPushManager } from "@/components/admin/seo-push-manager";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("SEO推送");
}

export default function SeoPush() {
    return (
        <div className="admin-page">
            <div className="admin-page-head">
                <div>
                    <h2 className="text-xl font-semibold tracking-tight">SEO推送</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                        向百度 / 必应 / Google / IndexNow 推送 URL 与站点地图，并查看推送结果（接口接入前为静态外壳）
                    </p>
                </div>
            </div>
            <SeoPushManager />
        </div>
    )
}
