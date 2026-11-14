"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import { useSidebar } from "@/components/ui/sidebar";

/**
 * 移动端：点侧边栏里的链接、跳转成功之后自动收起抽屉。
 *
 * 为什么单独拆一个客户端组件：AppSidebar 本身是 Server Component（要渲染站点配置里的
 * 图标/名称），在它里面直接用 useEffect / usePathname 会让整棵服务端树报错
 * （"importing a module that depends on useEffect into a React Server Component"）。
 * 这里只负责副作用、不渲染任何东西，因此放到 <Sidebar> 里当空气组件即可。
 *
 * 只在 isMobile 下执行：桌面端侧边栏常驻，调 setOpenMobile 没意义。
 * 延后一拍（setTimeout 0）是因为 effect 内同步 setState 会触发级联渲染。
 */
export function SidebarMobileAutoClose() {
    const pathname = usePathname();
    const { isMobile, setOpenMobile } = useSidebar();

    useEffect(() => {
        if (!isMobile) return;
        const timer = setTimeout(() => setOpenMobile(false), 0);
        return () => clearTimeout(timer);
    }, [pathname, isMobile, setOpenMobile]);

    return null;
}
