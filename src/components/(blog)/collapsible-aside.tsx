"use client";

import { useEffect, useState } from "react";

import { useSidebarCollapse } from "@/components/(blog)/sidebar-collapse-provider";

/** 桌面断点：与容器/侧边栏上的 `lg:`（Tailwind v4 默认 64rem = 1024px）保持同一口径 */
const DESKTOP_MEDIA_QUERY = "(min-width: 64rem)";

/**
 * 前台侧边栏容器：移动端排在正文下方且整宽显示，lg 起恢复右侧 300px 固定栏。
 *
 * 以前这里是 `hidden w-75 ... lg:block` —— 小屏（<1024px）被 `hidden` 直接 `display:none`，
 * 公告卡/作者卡/最近文章/标签云/归档等整块看不见。现在改成小屏在文档流里正常显示。
 *
 * `data-collapsed` 由 React 渲染。
 * 以前这个属性是 floating-actions 直接改 DOM 写上去的（服务端 HTML 里没有），
 * 侧边栏子树只要晚于那次改写 hydrate，React 就报 hydration 属性不匹配 ——
 * 现在服务端与客户端首帧一致（都是 "0"），挂载后由 Provider 按 localStorage 更新。
 * 另外它是**桌面专属语义**（收起按钮在 floating-actions 里是 `hidden ... lg:flex`，小屏点不到），
 * 见下方「小屏不写 data-collapsed=1」的说明。
 *
 * 恢复阶段加 `no-transition`：避免页面加载/路由切换时播放收起动画（与旧实现同口径）。
 */
export function CollapsibleAside({ children }: { children: React.ReactNode }) {
    const { collapsed } = useSidebarCollapse();
    // 挂载后先从 localStorage 恢复状态，这一小段时间内禁用过渡
    const [restoring, setRestoring] = useState(true);
    // 是否 lg 及以上。初值 false 与首帧 collapsed=false 一致，属性都是 "0"，不会造成 hydration 不匹配。
    const [isDesktop, setIsDesktop] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => setRestoring(false), 50);
        return () => clearTimeout(timer);
    }, []);

    // 为什么需要这一层：globals.css 里 `#blog-sidebar[data-collapsed="1"]{display:none !important}` 没有断点限定，
    // 小屏若带着 "1"（用户之前在桌面端收起了这个路径）就会被整块隐藏 —— 正是本次要修的现象。
    // 该规则是 ID + !important，优先级高于任何工具类（`block!` 也压不过它），而 globals.css 不在本次允许改动范围，
    // 所以从「不写这个属性」入手：小屏（含窗口缩小、真机同一浏览器共享 localStorage）恒为 "0"。
    useEffect(() => {
        const mql = window.matchMedia(DESKTOP_MEDIA_QUERY);
        const sync = () => setIsDesktop(mql.matches);
        sync();
        mql.addEventListener("change", sync);
        return () => mql.removeEventListener("change", sync);
    }, []);

    return (
        <aside
            id="blog-sidebar"
            data-collapsed={isDesktop && collapsed ? "1" : "0"}
            // max-lg:w-full!：globals.css 的 `#blog-sidebar{width:300px}` 是 ID 选择器，普通工具类压不过它，
            // 这里必须带 !（仓库既有写法，见 file-manager.tsx 的 `w-full!`）才能让小屏真的整宽；
            // lg 起交给 `lg:w-75`（300px，与 ID 规则同值，桌面宽度与观感不变）。
            // 不再用 `hidden`：小屏要在文档流里显示，只是从「右侧栏」变成「正文下方整块」。
            className={`max-lg:w-full! shrink-0 self-stretch lg:w-75${restoring ? " no-transition" : ""}`}
        >
            {children}
        </aside>
    );
}
