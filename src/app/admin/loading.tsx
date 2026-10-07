import { Skeleton } from "@/components/ui/skeleton";

/**
 * 后台加载态：按后台列表页的统一外壳画骨架屏。
 *
 * 骨架用的是真实页面同一套类名（.admin-page / .admin-page-head / .admin-card / .admin-scroll，
 * 见 globals.css），所以加载态与数据到位后的版式一致 —— 不会出现表格"跳一下"。
 * 后台多数页面是列表 + 表格，骨架屏比转圈更贴；具体行高按表格行量过（px-3 py-3）。
 */
export default function Loading() {
    return (
        <div className="admin-page">
            {/* 页顶标题区 */}
            <div className="admin-page-head">
                <div className="space-y-2">
                    <Skeleton className="h-6 w-28" />
                    <Skeleton className="h-3 w-60" />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Skeleton className="h-9 w-24" />
                    <Skeleton className="h-9 w-24" />
                    <Skeleton className="h-9 w-24" />
                </div>
            </div>

            {/* 列表卡片：工具栏（吸顶不滚）+ 表格区域 */}
            <div className="admin-card">
                <div className="flex shrink-0 flex-wrap items-center gap-2 border-b p-3">
                    <Skeleton className="h-8 w-64" />
                    <Skeleton className="h-8 w-30" />
                    <Skeleton className="h-8 w-26" />
                    <Skeleton className="h-8 w-26" />
                    <Skeleton className="ml-auto h-8 w-20" />
                </div>

                <div className="admin-scroll">
                    {/* 表头 */}
                    <div className="flex items-center gap-4 border-b px-3 py-2.5">
                        <Skeleton className="size-4 shrink-0" />
                        <Skeleton className="h-3 w-16" />
                        <Skeleton className="h-3 w-24" />
                        <Skeleton className="h-3 w-20" />
                        <Skeleton className="ml-auto h-3 w-14" />
                    </div>
                    {/* 若干行 */}
                    {Array.from({ length: 8 }).map((_, row) => (
                        <div key={row} className="flex items-center gap-4 border-b px-3 py-3 last:border-b-0">
                            <Skeleton className="size-4 shrink-0" />
                            <Skeleton className="h-3 flex-1" />
                            <Skeleton className="hidden h-3 w-48 sm:block" />
                            <Skeleton className="h-3 w-16" />
                            <Skeleton className="h-7 w-24 shrink-0" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
