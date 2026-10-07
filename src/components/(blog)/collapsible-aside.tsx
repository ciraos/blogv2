"use client";

import { useEffect, useState } from "react";

import { useSidebarCollapse } from "@/components/(blog)/sidebar-collapse-provider";

/**
 * 前台右侧边栏容器：`data-collapsed` 由 React 渲染。
 *
 * 以前这个属性是 floating-actions 直接改 DOM 写上去的（服务端 HTML 里没有），
 * 侧边栏子树只要晚于那次改写 hydrate，React 就报 hydration 属性不匹配 ——
 * 现在服务端与客户端首帧一致（都是 "0"），挂载后由 Provider 按 localStorage 更新。
 *
 * 恢复阶段加 `no-transition`：避免页面加载/路由切换时播放收起动画（与旧实现同口径）。
 */
export function CollapsibleAside({ children }: { children: React.ReactNode }) {
    const { collapsed } = useSidebarCollapse();
    // 挂载后先从 localStorage 恢复状态，这一小段时间内禁用过渡
    const [restoring, setRestoring] = useState(true);

    useEffect(() => {
        const timer = setTimeout(() => setRestoring(false), 50);
        return () => clearTimeout(timer);
    }, []);

    return (
        <aside
            id="blog-sidebar"
            data-collapsed={collapsed ? "1" : "0"}
            className={`hidden w-75 shrink-0 self-stretch lg:block${restoring ? " no-transition" : ""}`}
        >
            {children}
        </aside>
    );
}
