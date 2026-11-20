"use client";

import { useEffect } from "react";

/**
 * 平滑滚动（后台 post.smooth_scroll）。
 *
 * 为什么要客户端挂类名、而不是在服务端直接写在 <html> 上：
 * <html> 在根 layout 里，而站点配置是在 (blog) 这层才拿到的；这里用一行 DOM 操作更省事，
 * 也不会把配置依赖带进所有路由（后台、音乐馆不需要这个开关）。
 *
 * 真正生效的规则在 globals.css：`@media (prefers-reduced-motion: no-preference)`
 * 里的 `html.smooth-scroll { scroll-behavior: smooth }` —— 系统开了「减少动态效果」就不平滑。
 */
export function SmoothScroll({ enabled }: { enabled: boolean }) {
    useEffect(() => {
        if (!enabled) return;
        const root = document.documentElement;
        root.classList.add("smooth-scroll");
        return () => root.classList.remove("smooth-scroll");
    }, [enabled]);

    return null;
}
