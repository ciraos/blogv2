import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * 空态占位（各页统一）。
 *
 * 之前每个页面都手写 `<p className="py-16 text-center text-muted-foreground">暂无XXX</p>`，
 * 行距、字号、图标各不相同。这里收敛成一个组件：图标 + 主文案 + 可选补充说明 + 可选操作。
 *
 * 服务端渲染即可，没有状态。
 */
export function EmptyState({
    icon: Icon,
    title,
    description,
    action,
    className,
}: {
    /** lucide 图标组件（可不传） */
    icon?: LucideIcon;
    /** 主文案，如「暂无文章」 */
    title: string;
    /** 补充说明（小字） */
    description?: string;
    /** 底部操作（按钮 / 链接），可不传 */
    action?: React.ReactNode;
    className?: string;
}) {
    return (
        <div className={cn("flex flex-col items-center justify-center gap-2 border-t border-border/60 py-16 text-center", className)}>
            {Icon && (
                <span className="mb-2 flex size-10 items-center justify-center rounded-md border border-border/60">
                    <Icon className="size-5 text-muted-foreground/60" aria-hidden />
                </span>
            )}
            <p className="editorial-serif text-base text-muted-foreground">{title}</p>
            {description && <p className="max-w-sm text-xs leading-relaxed text-muted-foreground/70">{description}</p>}
            {action && <div className="mt-2">{action}</div>}
        </div>
    );
}
