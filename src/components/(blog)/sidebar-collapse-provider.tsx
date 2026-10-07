"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * 前台右侧边栏「收起」状态（按页面路径分别记忆）。
 *
 * 为什么单独抽成 Provider，而不是像以前那样在 floating-actions 里直接改 DOM：
 * 旧实现是 `document.getElementById("blog-sidebar").dataset.collapsed = "1"`，去改**服务端渲染出来的**
 * 那个 <aside>；只要侧边栏子树比这次 DOM 改写晚 hydrate（流式渲染下很常见），React 就会报
 *   A tree hydrated but some attributes of the server rendered HTML didn't match the client properties
 *   - data-collapsed="1"
 * 现在状态由这里持有、由 CollapsibleAside 用 React 渲染 data-collapsed：
 * 首屏服务端与客户端都渲染 "0"（一致 → 不报警），挂载后再从 localStorage 读出来更新。
 *
 * key 口径与旧实现一致（`blog-sidebar-collapsed:<path>`，并兼容迁移旧版全局 key）。
 */

/** 旧版全局 key（迁移来源） */
const LEGACY_KEY = "blog-sidebar-collapsed";

const keyFor = (path: string) => `blog-sidebar-collapsed:${path}`;

interface SidebarCollapseValue {
    collapsed: boolean;
    toggle: () => void;
}

const SidebarCollapseContext = createContext<SidebarCollapseValue | null>(null);

export function SidebarCollapseProvider({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    // 初值固定 false：与服务端渲染保持一致，避免 hydration 不匹配；挂载后再按 localStorage 恢复
    const [collapsed, setCollapsed] = useState(false);

    // 首屏 / 路由切换后：读取当前路径的记录（无记录时沿用一次旧版全局值并迁移过去）
    useEffect(() => {
        const timer = setTimeout(() => {
            try {
                let saved = window.localStorage.getItem(keyFor(pathname));
                if (saved === null) {
                    saved = window.localStorage.getItem(LEGACY_KEY);
                    if (saved !== null) window.localStorage.setItem(keyFor(pathname), saved);
                }
                setCollapsed(saved === "1");
            } catch {
                // 隐私模式等读不到 localStorage：保持展开
            }
        }, 0);
        return () => clearTimeout(timer);
    }, [pathname]);

    const toggle = useCallback(() => {
        setCollapsed((prev) => {
            const next = !prev;
            try {
                window.localStorage.setItem(keyFor(pathname), next ? "1" : "0");
            } catch {
                // 忽略
            }
            return next;
        });
    }, [pathname]);

    const value = useMemo(() => ({ collapsed, toggle }), [collapsed, toggle]);

    return <SidebarCollapseContext.Provider value={value}>{children}</SidebarCollapseContext.Provider>;
}

/** 读取侧边栏收起状态；必须在 SidebarCollapseProvider 内使用 */
export function useSidebarCollapse(): SidebarCollapseValue {
    const ctx = useContext(SidebarCollapseContext);
    if (!ctx) {
        throw new Error("useSidebarCollapse 必须在 SidebarCollapseProvider 内使用");
    }
    return ctx;
}
