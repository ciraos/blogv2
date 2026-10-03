"use client";

import { PanelLeftCloseIcon, PanelLeftOpenIcon } from "lucide-react";

import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

/**
 * 侧边栏收缩按钮。
 * 比默认的纯 ghost 图标更好看也更好懂：带描边与悬停底色，像个真正的按钮；
 * 而且图标随状态切换 —— 展开时显示「收起」（面板＋左箭头向内），收起时显示「展开」（箭头向外）。
 */
export function SidebarCollapseButton({ className }: { className?: string }) {
    const { state, toggleSidebar } = useSidebar();
    const collapsed = state === "collapsed";
    const Icon = collapsed ? PanelLeftOpenIcon : PanelLeftCloseIcon;
    const label = collapsed ? "展开侧边栏" : "收起侧边栏";

    return (
        <button
            type="button"
            onClick={toggleSidebar}
            aria-label={label}
            title={label}
            className={cn(
                "inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-sidebar-border bg-background/60 text-muted-foreground transition-colors",
                "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none",
                className,
            )}
        >
            <Icon className="size-4" />
        </button>
    );
}
