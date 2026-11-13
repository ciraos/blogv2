import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CommentFeed } from "@/components/admin/comment-feed";
import { QuickActions } from "@/components/admin/quick-actions";
import { StatisticsSummary } from "@/components/admin/statistics-summary";
import { ApiError, getUserInfoApi } from "@/lib/api";
import type { LoginUserInfo } from "@/types/auth";
import { generateBlogMetadata } from "@/lib/seo";

// 区块标题：衬线标题 + 一条向右延伸的发丝线。
// 这里刻意不再带主题色竖条：一屏出现三次的彩色竖条只是「装饰性的标题」，把强调色花在了
// chrome（每个区块的头部）上，真正该被强调的数据反而被它抢了注意力。
function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
    return (
        <h2 className="editorial-serif mb-3 flex items-center gap-3 text-[15px] font-semibold">
            {children}
            {hint && <span className="font-mono text-[11px] font-normal text-muted-foreground">{hint}</span>}
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
            {/* 页头：标题与「欢迎回来」同一基线，名字用等宽小字靠右 —— 后台每天开着，
                问候语不该和页面标题一样大。 */}
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h1 className="editorial-serif text-[26px] leading-none font-bold tracking-tight">仪表盘</h1>
                <p className="font-mono text-[11px] text-muted-foreground">
                    欢迎回来，{user.nickname || user.username}
                </p>
            </div>

            {/* 主区块：**普通文档流顺序**纵向堆叠（动态 → 快速操作 → 统计）。
                这里刻意不用 CSS 多列（columns-*）承载主区块：多列是「列优先」填充，
                会把排在前面的「最新评论」甩到左下方，阅读顺序错乱。
                各区块**内部**的独立小卡才用 Grid 错落铺开（见 CommentFeed / StatisticsSummary） */}
            <div className="mt-4 flex flex-col gap-5">
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

            </div>
        </>
    );
}
