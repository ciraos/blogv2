export default function Loading() {
    return (
        <div className="flex w-full flex-col items-center gap-8 py-28">
            {/* 转圈指示器 */}
            <div className="relative size-12">
                <div className="absolute inset-0 rounded-full border-4 border-muted" />
                <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-primary" />
            </div>
            <p className="text-sm text-muted-foreground">正在加载，请稍候…</p>

            {/* 内容骨架 */}
            <div className="w-full max-w-2xl space-y-4">
                <div className="h-44 animate-pulse rounded-xl bg-muted" />
                <div className="grid grid-cols-2 gap-4">
                    <div className="h-36 animate-pulse rounded-xl bg-muted" />
                    <div className="h-36 animate-pulse rounded-xl bg-muted" />
                </div>
            </div>
        </div>
    );
}
