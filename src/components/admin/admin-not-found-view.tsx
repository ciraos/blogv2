import Link from "next/link";

/**
 * 后台专属 404 视图：紧凑密度 + 主题令牌配色（深浅色都走 primary/muted-foreground，不写死颜色）。
 *
 * 两个使用方：
 *   1. `src/app/admin/not-found-view/page.tsx` —— **中间件 rewrite 的落点**，用于
 *      `/admin/<乱写>`：状态码由 proxy.ts 给 404，这个页面只负责在后台外壳里画出界面；
 *   2. `src/app/admin/[...rest]/page.tsx` —— 兜底路由（构建期路由表没覆盖到的极端情况）。
 *
 * 抽成共享组件的意义：两条路径的 404 长得一模一样，改文案时不会只改一半。
 */
export function AdminNotFoundView() {
    return (
        <div className="flex min-h-[60vh] w-full flex-col items-center justify-center gap-6 p-6 text-center">
            {/* 渐变大字：沿用前台 404 的字重/渐变手法，尺寸为后台紧凑版 */}
            <div className="select-none bg-gradient-to-b from-foreground via-foreground to-muted-foreground bg-clip-text text-6xl font-black tracking-tight text-transparent">
                404
            </div>
            <div className="space-y-1.5">
                <h2 className="text-xl font-bold tracking-tight">页面不存在</h2>
                <p className="text-sm text-muted-foreground">
                    你访问的后台页面不存在或已被移除，返回工作台继续操作吧。
                </p>
            </div>
            <div className="flex flex-wrap justify-center gap-3">
                <Link
                    href="/admin/dashboard"
                    className="inline-flex items-center rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
                >
                    返回仪表盘
                </Link>
                <Link
                    href="/"
                    className="inline-flex items-center rounded-lg border px-5 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
                >
                    访问前台
                </Link>
            </div>
        </div>
    );
}
