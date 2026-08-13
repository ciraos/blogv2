import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { ApiError, getBasicStatisticsApi, getUserInfoApi } from "@/lib/api";
import type { BasicStatistics } from "@/lib/api";
import type { LoginUserInfo } from "@/types/auth";

const site_url = process.env.NEXT_PUBLIC_SITE_URL;
const api_url = process.env.NEXT_PUBLIC_API_URL;

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

    const statsItems: { label: string; value: number }[] = [
        { label: "今日访问", value: stats.today_visitors },
        { label: "今日浏览", value: stats.today_views },
        { label: "本月浏览", value: stats.month_views },
        { label: "本年浏览", value: stats.year_views },
    ];

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">仪表盘</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    欢迎回来，{user.nickname || user.username}
                </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {statsItems.map((item) => (
                    <Card key={item.label}>
                        <CardHeader>
                            <CardTitle className="text-sm text-muted-foreground">{item.label}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{item.value.toLocaleString()}</div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">账号信息</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
                    <div>用户名：<span className="font-medium">{user.username}</span></div>
                    <div>昵称：<span className="font-medium">{user.nickname || "—"}</span></div>
                    <div>邮箱：<span className="font-medium">{user.email}</span></div>
                    <div>用户组：<span className="font-medium">{user.userGroup?.name || "—"}</span></div>
                </CardContent>
            </Card>
        </div>
    );
}
