import type { Metadata } from "next";
import { generateBlogMetadata } from "@/lib/seo";
import { NotificationsManager } from "@/components/admin/notifications-manager";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("通知管理");
}

export default function Notifications() {
    return (
        <div className="flex flex-col gap-3">
            <div>
                <h2 className="text-xl font-semibold tracking-tight">通知管理</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                    查看系统支持的通知类型，并管理当前账号的通知订阅（评论回复通知可开关，其余为只读明细）
                </p>
            </div>
            <NotificationsManager />
        </div>
    );
}
