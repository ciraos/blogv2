import Link from "next/link";

/**
 * 后台「兜底路由」：/admin/ 下任何**没有对应页面的路径**都落到这里，并在**后台外壳内**渲染 404。
 *
 * ── 一句话理解 ──
 * 它**不是 404 模板，而是一个"真页面"**：一间盖在后台大楼里的「杂物间」——所有没主的 /admin/* 请求
 * 都被领进这间屋子，因为屋子在后台楼里，所以永远套着后台外壳（侧边栏等），不会串到前台去。
 *
 * ── 为什么需要它：Next 的两条 404 路径，我们两条都用不上 ──
 *   Next 里 404 只有两种触发方式：
 *   ① 代码里**显式调用 notFound()** → 用**最近的 not-found 边界**（组内有就用组内的）；
 *   ② URL **真正未匹配任何路由** → 用**全局** not-found，并由 Next 挑一个根布局来包。
 *   我们的情况：
 *   - 后台代码里**没有任何地方**调用 notFound()（全仓 grep 过），① 用不上；
 *   - `/admin/<乱写>` 属于 ② —— 而本项目**没有根 src/app/layout.tsx**（4 个路由组各自带 <html>/<body>：
 *     (blog) / (auth) / admin / music），Next 16 文档
 *     (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/not-found.md 第 53-56 行)
 *     写明「多个根布局时没有唯一的 layout 可以组装全局 404」，于是它**随机挑了一个根布局**来套
 *     —— 实测挑中的是 **(blog)**。结果 `/admin/qa` 渲染出「前台博客外壳（葱苓小筑 + 文库/友链/我的/关于）
 *     + 前台 404 文案」，也就是用户看到的「俩 404 放一起」。
 *
 * ── 修法（本文件）：让 URL「匹配上一个真路由」，而不是「未匹配」 ──
 *   `[...rest]` 是 catch-all，能匹配 /admin 下任意多级路径。于是这些 URL 不再走 ② 的全局机制，
 *   而是作为一个**正常页面**在 `src/app/admin/layout.tsx` 的树里渲染 → **后台外壳是确定的**，
 *   不依赖"全局 404 套哪个根布局"那套不确定的解析，也就不可能再串到前台导航。
 *
 *   ⚠️ 因此这里**直接渲染** 404 UI，而**不去调用 notFound()**：调了就等于放弃本文件、回到 ① 的不确定边界。
 *   （原先的 src/app/admin/not-found.tsx 已按"全局只留一个 not-found"的要求删除；将来若有后台页面
 *    显式调用 notFound()，可以再把它加回来作为组内边界。）
 */


/** 后台专属 404 视图：紧凑密度 + 主题令牌配色（深浅色都走 primary/muted-foreground，不写死颜色）。 */
function AdminNotFoundView() {
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

export default function AdminCatchAll() {
    return <AdminNotFoundView />;
}
