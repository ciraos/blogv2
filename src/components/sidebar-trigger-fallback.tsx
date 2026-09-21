"use client";

import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";

/**
 * 侧边栏折叠按钮的「兜底入口」。
 *
 * 折叠按钮本身已经挪进侧边栏顶部、站名右侧；但侧边栏收起来后（桌面端 offcanvas 会整体滑出屏幕、
 * 移动端是关闭状态的抽屉），栏内那个按钮就点不到了，所以这里补一个：
 * 仅在「侧边栏当前不可见」时渲染，可见时不渲染 —— 不会再白占一行空间。
 */
export function SidebarTriggerFallback() {
    const { state, isMobile, openMobile } = useSidebar();
    const sidebarVisible = isMobile ? openMobile : state === "expanded";
    if (sidebarVisible) return null;

    return (
        <SidebarTrigger
            aria-label="展开侧边栏"
            title="展开侧边栏"
            className="mb-1 shrink-0 self-start"
        />
    );
}
