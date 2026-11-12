import { cn } from "@/lib/utils";

export interface StatItem {
    label: string;
    value: React.ReactNode;
}

/**
 * 统计读数条：一屏顶部的几个关键数字，排成一条，格子之间是发丝线。
 *
 * 原来后台每个列表页顶部都是「N 张各自带描边的卡片，每张左边一个彩色方块图标」：
 * 十一页重复同一套装饰，颜色（蓝/紫/橙…）只是给图标上色，没有一个在解释数字。
 * 数字是这一屏最该被读的东西，所以让它自己排队：标签小字在上，数字等宽在下，
 * 其余全是留白和一条发丝线。
 */
const COL_CLASS: Record<number, string> = {
    2: "md:grid-cols-2",
    3: "md:grid-cols-3",
    4: "md:grid-cols-4",
    5: "md:grid-cols-5",
    6: "md:grid-cols-6",
};

export function StatStrip({ items, className }: { items: StatItem[]; className?: string }) {
    const cols = COL_CLASS[Math.min(6, Math.max(2, items.length))] ?? COL_CLASS[4];
    return (
        <div className={cn("grid shrink-0 grid-cols-2 border-b", cols, className)}>
            {items.map((item, index) => (
                <div
                    key={item.label}
                    className={cn(
                        "px-4 py-3",
                        index % 2 === 1 && "border-l border-border/60",
                        index >= 2 && "border-t border-border/60 md:border-t-0 md:border-l"
                    )}
                >
                    <p className="text-[11px] text-muted-foreground">{item.label}</p>
                    <p className="mt-1 font-mono text-lg leading-none font-semibold tabular-nums">{item.value}</p>
                </div>
            ))}
        </div>
    );
}
