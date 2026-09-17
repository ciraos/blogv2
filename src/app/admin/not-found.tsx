import Link from "next/link";

// 后台嵌套 404：在 admin 布局（含侧边栏）内渲染，避免命不中后台路由时页面落到根
// not-found 而拆掉整个后台应用树。这样「进入 404 后点浏览器返回」时侧边栏/布局保持挂载，
// 返回后的上一页交互（按钮点击）不会因应用树被重建而失效。
export default function AdminNotFound() {
    return (
        <div className="flex min-h-[60vh] w-full flex-col items-center justify-center gap-6 p-6 text-center">
            <div className="select-none bg-gradient-to-b from-foreground via-foreground to-muted-foreground bg-clip-text text-6xl font-black tracking-tight text-transparent">
                404
            </div>
            <div className="space-y-1.5">
                <h2 className="text-xl font-bold tracking-tight">后台页面不存在</h2>
                <p className="text-sm text-muted-foreground">
                    你访问的后台页面不存在或已被移除，返回工作台继续操作吧。
                </p>
            </div>
            <div className="flex flex-wrap justify-center gap-3">
                <Link
                    href="/admin/dashboard"
                    className="inline-flex items-center rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
                >
                    返回工作台
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
