import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CommentFeed } from "@/components/admin/comment-feed";
import { QuickActions } from "@/components/admin/quick-actions";
import { StatisticsSummary } from "@/components/admin/statistics-summary";
import { VisitorLogsCard } from "@/components/admin/visitor-logs-card";
import { ApiError, getUserInfoApi } from "@/lib/api";
import type { LoginUserInfo } from "@/types/auth";
import { generateBlogMetadata } from "@/lib/seo";

// 区块标题：左侧主题色竖条 + 标题 + 向右延伸的分隔线（紧凑密度：标题 text-base）
function SectionTitle({ children }: { children: React.ReactNode }) {
    return (
        <h2 className="mb-3 flex items-center gap-2.5 text-base font-semibold tracking-tight">
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

            {/* 主区块：**普通文档流顺序**纵向堆叠（动态 → 快速操作 → 统计）。
                这里刻意不用 CSS 多列（columns-*）承载主区块：多列是「列优先」填充，
                会把排在前面的「最新评论」甩到左下方，阅读顺序错乱。
                各区块**内部**的独立小卡才用 Grid 错落铺开（见 CommentFeed / StatisticsSummary） */}
            <div className="flex flex-col gap-3">
                {/* 动态（最新评论 + 待审友链）：放在「快速操作」上方。
                    右侧原来是「待审评论」卡，按需求换成「待审友链」卡（列出全部申请中的友链）。 */}
                <section>
                    <SectionTitle>动态</SectionTitle>
                    <CommentFeed />
                </section>

                {/* 快速操作：常用管理入口（自身是 3×2 / 6×1 的磁贴网格） */}
                <section>
                    <SectionTitle>快速操作</SectionTitle>
                    <QuickActions />
                </section>

                {/* 统计：基础统计 + 趋势 + 访客分析 + 热门页面（卡片网格） */}
                <section>
                    <SectionTitle>统计</SectionTitle>
                    <StatisticsSummary />
                </section>

                {/* 访问日志：**整宽卡片**，排在统计之后（卡内自带图标 + 小标题 + 日期工具条 + 前 10 条）。
                    ⚠️ 位置约定：以后新增的仪表盘卡片**一律追加在这张「访问日志」卡片下方**，
                    不要插到它上面，保证后续加卡片的位置一致。 */}
                <VisitorLogsCard />
            </div>
        </>
    );
}
