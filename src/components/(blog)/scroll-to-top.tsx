"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * 全局页面切换时强制回到顶部。
 * 问题：从任意页面（首页/归档/分类等）滚动到非顶部后点击进入文章详情页，
 * 浏览器/Next 的滚动恢复会把来源页的滚动位置带到新页面。
 * 此组件在路由变化时禁用浏览器滚动恢复并强制回顶（同页锚点/分页不受影响，
 * 因为它们不改变 pathname）。
 */
export function ScrollToTop() {
    const pathname = usePathname();

    useEffect(() => {
        // 禁用浏览器原生滚动恢复（避免返回时位置错乱），导航后手动回顶
        if ("scrollRestoration" in history) {
            history.scrollRestoration = "manual";
        }
        // 带锚点（#hash）进入时不做回顶：交给文章页挂载后的锚点滚动
        if (window.location.hash) return;
        window.scrollTo(0, 0);
        // 流式渲染内容到达后可能再次滚动，补一次回顶
        const timer = window.setTimeout(() => window.scrollTo(0, 0), 50);
        return () => window.clearTimeout(timer);
    }, [pathname]);

    return null;
}
