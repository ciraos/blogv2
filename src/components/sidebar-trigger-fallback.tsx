"use client";

import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";

/**
 * 侧边栏折叠按钮的「兜底入口」（仅移动端需要）。
 *
 * 桌面端侧边栏是 `collapsible="icon"`：收起后仍留一条图标栏，栏内的折叠按钮照样点得到，
 * 所以桌面端不需要兜底；移动端侧边栏是抽屉，关闭时栏内按钮点不到，这里补一个入口。
 */
export function SidebarTriggerFallback() {
    const { isMobile, openMobile } = useSidebar();
    // 移动端抽屉开着时，抽屉里那个按钮可见，无需兜底
    if (!isMobile || openMobile) return null;

    return (
        <SidebarTrigger
            aria-label="展开侧边栏"
            title="展开侧边栏"
            className="mb-1 shrink-0 self-start"
        />
    );
}
