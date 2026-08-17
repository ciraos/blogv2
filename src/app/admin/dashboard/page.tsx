import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { StatCard } from "@/components/(admin)/stat-card";
import { ApiError, getBasicStatisticsApi, getUserInfoApi } from "@/lib/api";
import type { BasicStatistics } from "@/lib/api";
import type { LoginUserInfo } from "@/types/auth";

const api_url = process.env.NEXT_PUBLIC_API_URL;

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
    const a = await fetch(`${api_url}/public/site-config`);
    const data = await a.json();
    return {
        title: data.data.APP_NAME + ' - 仪表盘',
        description: data.data.SUB_TITLE,
    };
}

export default async function Dashboard() {
    // 读取 accessToken（proxy 已拦截未登录访问，这里兜底）
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) redirect("/login");

    let user: LoginUserInfo;
    let stats: BasicStatistics;
    try {
        [user, stats] = await Promise.all([
            getUserInfoApi(token),
            getBasicStatisticsApi(),
        ]);
    } catch (err) {
        // token 失效 → 走登出路由清 cookie 再回登录页
        if (err instanceof ApiError && err.status === 401) {
            redirect("/api/auth/logout");
        }
        throw err;
    }

    // 环比百分比：基准为 0 时无法计算（返回 null 显示 —）
    const pct = (current: number, previous: number): number | null =>
        previous === 0 ? null : ((current - previous) / previous) * 100;

    return (
        <>
            <div className="flex flex-col">
                <h1 className="text-2xl font-bold tracking-tight">仪表盘</h1>
                <p className="ml-0 mt-1 text-sm text-muted-foreground content-end">
                    欢迎回来，{user.nickname || user.username}
                </p>
            </div>

            <SectionTitle>统计</SectionTitle>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                    label="今日访问"
                    value={stats.today_visitors}
                    deltaPercent={pct(stats.today_visitors, stats.yesterday_visitors)}
                    deltaLabel="较昨日"
                />
                <StatCard
                    label="今日浏览"
                    value={stats.today_views}
                    deltaPercent={pct(stats.today_views, stats.yesterday_views)}
                    deltaLabel="较昨日"
                />
                {/* /public/statistics/basic 无上月基准数据，不显示环比 */}
                <StatCard label="本月浏览" value={stats.month_views} deltaPercent={null} />
                <StatCard label="本年浏览" value={stats.year_views} deltaPercent={null} />
            </div>

            {/* 杂项：预留区块（未来放小工具） */}
            <SectionTitle>杂项</SectionTitle>
        </>
    );
}
