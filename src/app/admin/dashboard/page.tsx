import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { QuickActions } from "@/components/admin/quick-actions";
import { StatisticsSummary } from "@/components/admin/statistics-summary";
import { ApiError, getUserInfoApi } from "@/lib/api";
import type { LoginUserInfo } from "@/types/auth";
import { generateBlogMetadata } from "@/lib/seo";

// 区块标题：左侧主题色竖条 + 标题 + 向右延伸的分隔线
function SectionTitle({ children }: { children: React.ReactNode }) {
    return (
        <h2 className="mt-8 mb-4 flex items-center gap-2.5 text-lg font-semibold tracking-tight">
            <span className="h-4 w-1 rounded-full bg-primary" aria-hidden="true" />
            {children}
            <span className="h-px flex-1 bg-border" aria-hidden="true" />
        </h2>
    );
}

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("仪表盘");
}

export default async function Dashboard() {
    // 读取 accessToken（proxy 已拦截未登录访问，这里兜底）
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) redirect("/login");

    let user: LoginUserInfo;
    try {
        user = await getUserInfoApi(token);
    } catch (err) {
        // token 失效 → 走登出路由清 cookie 再回登录页
        if (err instanceof ApiError && err.status === 401) {
            redirect("/api/auth/logout");
        }
        throw err;
    }

    return (
        <>
            <div className="flex flex-col">
                <h1 className="text-2xl font-bold tracking-tight">仪表盘</h1>
                <p className="ml-0 mt-1 text-sm text-muted-foreground content-end">
                    欢迎回来，{user.nickname || user.username}
                </p>
            </div>

            {/* 快速操作：常用管理入口 */}
            <SectionTitle>快速操作</SectionTitle>
            <QuickActions />

            {/* 统计概览（基础统计 + 趋势 + 访客分析排行 + 热门页面） */}
            <SectionTitle>统计</SectionTitle>
            <StatisticsSummary />
        </>
    );
}
