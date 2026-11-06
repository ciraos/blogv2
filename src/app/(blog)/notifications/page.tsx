import type { Metadata } from "next";
import { cookies } from "next/headers";

import { NotificationsContent } from "@/components/(blog)/notifications-content";
import { generateBlogMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
    // 页面标题与官方一致（用户菜单入口叫「全部通知」）
    return generateBlogMetadata("消息通知");
}

/**
 * 消息通知：
 * 登录态由服务端 cookie 判断后传给客户端组件；未登录时只渲染「请先登录」空态、不发请求。
 */
export default async function Notifications() {
    const isLoggedIn = !!(await cookies()).get("token")?.value;
    return <NotificationsContent isLoggedIn={isLoggedIn} />;
}
