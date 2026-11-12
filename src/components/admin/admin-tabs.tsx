"use client";
import { cn } from "@/lib/utils";

export interface AdminTabItem<K extends string = string> {
    key: K;
    label: string;
    /** 可选的计数，等宽数字，跟在标签后面 */
    count?: number;
}

/**
 * 分段页签：会员、相册、主题这些一页装两张表的页面用。
 *
 * 原来是「圆角边框 + 两段按钮拼成的胶囊」，激活项还有 bg-primary/10 + 主色文字，
 * 一屏里多出了一个彩色块——而且它跟右侧筛选控件挤在同一行，
 * 页签和筛选器互相抢位置。现在页签单独占一行，只靠一条发丝加粗下划线表示选中，
 * 筛选条另起一行（AdminFilterBar），两件事不再混排。
 */
export function AdminTabBar<K extends string>({
    tabs,
    value,
    onChange,
    className,
}: {
    tabs: readonly AdminTabItem<K>[];
    value: K;
    onChange: (key: K) => void;
    className?: string;
}) {
    return (
        <div
            role="tablist"
            className={cn("flex shrink-0 items-stretch gap-1 overflow-x-auto border-b px-3", className)}
        >
            {tabs.map((tab) => {
                const active = tab.key === value;
                return (
                    <button
                        key={tab.key}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => onChange(tab.key)}
                        className={cn(
                            "-mb-px shrink-0 border-b-2 px-2.5 py-2 text-sm whitespace-nowrap transition-colors",
                            active
                                ? "border-foreground font-medium text-foreground"
                                : "border-transparent text-muted-foreground hover:text-foreground"
                        )}
                    >
                        {tab.label}
                        {typeof tab.count === "number" && (
                            <span className="ml-1.5 font-mono text-xs tabular-nums text-muted-foreground">
                                {tab.count}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}
