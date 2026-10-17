import type { Metadata } from "next";

import { AdminNotFoundView } from "@/components/admin/admin-not-found-view";

export const metadata: Metadata = {
    title: "404 · 页面不存在",
};

/**
 * 后台 404 的**落点页**（由 src/proxy.ts 重写过来）。
 *
 * 为什么不直接在别的页面里 return 404：App Router 的页面组件无法设置 HTTP 状态码。
 * 中间件可以 —— `NextResponse.rewrite(url, { status: 404 })` 在流式输出开始前就把状态定下来，
 * 而重写的目标落在这个目录里，就仍然套着 admin 的 layout（侧边栏/主题/用户卡都在）。
 *
 * 也就是说：
 *   - 状态码：由 proxy.ts 给（真 404，爬虫/监控/前端 fetch 都能正确判断）；
 *   - 外观：由本页 + admin layout 给（后台外壳，不会串成前台 404）。
 */
export default function AdminNotFoundPage() {
    return <AdminNotFoundView />;
}
