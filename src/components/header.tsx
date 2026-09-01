"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { ChevronDown, FileText, Menu, Moon, Sun, Tag as TagIcon } from "lucide-react";

import {
    Sheet,
    SheetClose,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet";

import { UserMenu } from "@/components/user-menu";
import { SearchDialog } from "@/components/(blog)/search-dialog";
import { cn } from "@/lib/utils";
import type { HeaderMenuGroup, UserPanelConfig } from "@/types/site-config";

interface HeaderProps {
    /** 站点配置中的导航菜单（header.menu） */
    menu?: HeaderMenuGroup[];
    /** 站点名称 */
    appName?: string;
    /** 是否已登录（服务端读取 httpOnly cookie 传入） */
    isLoggedIn?: boolean;
    /** 用户面板开关（userpanel，登录态用户菜单按开关显示） */
    userpanel?: UserPanelConfig;
    /** 已登录用户的头像 URL（服务端从用户信息获取后传入；空则用默认图标） */
    userAvatar?: string | null;
    /** 移动端汉堡菜单：标签云（服务端聚合后传入） */
    mobileTags?: { id: string; name: string; count: number }[];
    /** 移动端汉堡菜单：网站信息（文章数/字数/建站天数开关，与侧边栏一致） */
    siteinfo?: { runtimeEnable: boolean; totalPostCount: number; totalWordCount: number };
    /** 移动端汉堡菜单：建站起点（归档最早月份，用于计算建站天数） */
    siteCreatedAt?: string;
}

/** 站点建站天数（按最新文章日期估算，与侧边栏一致） */
function daysSince(createdAt?: string): number {
    if (!createdAt) return 0;
    const start = new Date(createdAt).getTime();
    if (Number.isNaN(start)) return 0;
    return Math.max(1, Math.floor((Date.now() - start) / 86400000));
}

export default function Header({ menu = [], appName = "博客", isLoggedIn = false, userpanel, userAvatar, mobileTags = [], siteinfo, siteCreatedAt }: HeaderProps) {
    // 桌面端下拉：hover 展开，一次只开一个
    const [openGroup, setOpenGroup] = useState<string | null>(null);
    // 关闭宽限期：鼠标穿过触发器与面板之间的间隙时不误关
    const closeTimer = useRef<number | null>(null);
    // 下滑超过阈值时胶囊背景变半透明毛玻璃，回到顶部恢复
    const [scrolled, setScrolled] = useState(false);
    // 深浅色切换（移动端汉堡菜单"功能"区块）
    const { setTheme } = useTheme();

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 40);
        // React Compiler 规则：effect 内不直接同步 setState，用宏任务包裹初始求值
        const t = setTimeout(onScroll, 0);
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => {
            clearTimeout(t);
            window.removeEventListener("scroll", onScroll);
        };
    }, []);

    // 超级岛式弹性切换：spring 过冲曲线（cubic-bezier 回弹）+ 缩放形变
    const pillCls = cn(
        "transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] will-change-transform",
        scrolled ? "scale-[0.94] bg-card/60 shadow-sm backdrop-blur-md" : "scale-100 bg-card shadow-md"
    );
    function handleEnter(title: string) {
        if (closeTimer.current !== null) {
            window.clearTimeout(closeTimer.current);
            closeTimer.current = null;
        }
        setOpenGroup(title);
    }

    function handleLeave() {
        closeTimer.current = window.setTimeout(() => setOpenGroup(null), 150);
    }

    return (
        <>
            <div className="header w-full max-w-300 h-12 my-1 mx-auto px-2 sm:px-0 sticky top-0 z-50 bg-none rounded-none flex items-center justify-between">
                <Link href="/" className={`h-11 py-1 px-3 rounded-[99px] ${pillCls} text-base text-center content-center font-bold tracking-tight hover:opacity-80 hover:shadow-xl`}>{appName}</Link>

                {/* 桌面端导航（≥768px）：自研下拉，面板绝对定位在触发器正下方 */}
                {menu.length > 0 && (
                    <nav className="hidden md:block">
                        <ul className={`py-1 px-3 rounded-[99px] ${pillCls} flex items-center gap-0.5 hover:shadow-xl`}>
                            {menu.map((group) => (
                                <li
                                    key={group.title}
                                    className="relative"
                                    onMouseEnter={() => handleEnter(group.title)}
                                    onMouseLeave={handleLeave}
                                >
                                    <button
                                        className={cn(
                                            "flex h-9 items-center gap-1 rounded-lg px-3 text-base font-medium transition-colors hover:text-primary",
                                            openGroup === group.title && "text-primary"
                                        )}
                                    >
                                        {group.title}
                                        <ChevronDown
                                            className={cn(
                                                "size-3.5 transition-transform duration-200",
                                                openGroup === group.title && "rotate-180"
                                            )}
                                        />
                                    </button>

                                    {/* 下拉面板：紧贴触发器正下方居中 */}
                                    {openGroup === group.title && (
                                        <div className="absolute left-1/2 top-full z-50 mt-2 min-w-24 -translate-x-1/2 rounded-lg border bg-popover p-1.5 text-popover-foreground shadow-lg">
                                            <ul className="space-y-1">
                                                {group.items.map((item) => (
                                                    <li key={item.path + item.title}>
                                                        <Link
                                                            href={item.path}
                                                            target={item.isExternal ? "_blank" : undefined}
                                                            rel={item.isExternal ? "noopener noreferrer nofollow" : undefined}
                                                            className="block rounded-md px-2 py-2.5 text-center text-sm transition-colors hover:bg-muted"
                                                        >
                                                            {item.title}
                                                        </Link>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </nav>
                )}

                <div className="flex items-center justify-around gap-1 md:gap-4">
                    {/* 搜索 + 移动端汉堡：共用同一个白色胶囊背景（滚动时一起收缩）。
                        桌面端汉堡隐藏、搜索保留；两个按钮无缝拼接，中间接缝不设圆角 */}
                    <div className={`flex items-center rounded-full ${pillCls} hover:shadow-xl`}>
                        {/* 站内搜索：点击放大镜弹出搜索对话框 */}
                        <SearchDialog />

                        {/* 移动端汉堡菜单（<768px），与搜索按钮共用胶囊背景 */}
                        <Sheet>
                            <SheetTrigger asChild>
                                <button
                                    className="inline-flex size-11 items-center justify-center rounded-l-none rounded-r-lg text-muted-foreground transition-colors hover:text-primary md:hidden"
                                    aria-label="打开菜单"
                                >
                                    <Menu className="size-5" />
                                </button>
                            </SheetTrigger>
                            <SheetContent side="right" className="w-72 mx-auto sm:max-w-sm">
                                <SheetHeader className="items-center">
                                    {/* 花哨渐变标题：粉紫渐变 + 背景流动动画（同关于页 about-gradient） */}
                                    <SheetTitle className="animate-[about-gradient_8s_ease_infinite] bg-gradient-to-r from-pink-500 via-fuchsia-500 to-indigo-500 bg-clip-text bg-[length:200%_auto] text-center text-xl font-bold text-transparent">
                                        {appName}
                                    </SheetTitle>
                                </SheetHeader>

                                {/* 整个菜单内容一起滚动（功能/菜单/标签/网站信息），标题固定 */}
                                <div className="no-scrollbar flex-1 space-y-6 overflow-y-auto px-3 pb-6">
                                    <div>
                                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">功能</h3>
                                        {/* 深浅色切换按钮（黑色细边框、无背景、圆角，与下方标签/网站信息风格一致） */}
                                        <button
                                            type="button"
                                            onClick={() => setTheme(document.documentElement.classList.contains("dark") ? "light" : "dark")}
                                            className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-foreground/25 text-sm transition-colors hover:border-foreground"
                                        >
                                            <Sun className="size-4 dark:hidden" />
                                            <Moon className="hidden size-4 dark:block" />
                                            <span className="dark:hidden">切换到深色</span>
                                            <span className="hidden dark:block">切换到浅色</span>
                                        </button>
                                    </div>
                                    {menu.map((group) => (
                                        <div key={group.title}>
                                            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                                {group.title}
                                            </h3>
                                            <ul className="mt-2 grid grid-cols-2 gap-2">
                                                {group.items.map((item) => (
                                                    <li key={item.path + item.title}>
                                                        <SheetClose asChild>
                                                            <Link
                                                                href={item.path}
                                                                target={item.isExternal ? "_blank" : undefined}
                                                                rel={item.isExternal ? "noopener noreferrer nofollow" : undefined}
                                                                className="flex items-center justify-center rounded-lg bg-muted px-3 py-2.5 text-center text-sm text-muted-foreground transition-colors hover:bg-primary hover:text-primary-foreground"
                                                            >
                                                                {item.title}
                                                            </Link>
                                                        </SheetClose>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    ))}

                                    {/* 标签：黑色细边框 + 圆角，无背景色 */}
                                    {mobileTags.length > 0 && (
                                        <div>
                                            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                                <TagIcon className="mr-1 inline size-3.5" />
                                                标签
                                            </h3>
                                            <div className="mt-2 flex flex-wrap gap-2">
                                                {mobileTags.map((tag) => (
                                                    <SheetClose asChild key={tag.id}>
                                                        <Link
                                                            href={`/tags?name=${encodeURIComponent(tag.name)}`}
                                                            className="rounded-lg border border-foreground/25 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
                                                        >
                                                            #{tag.name}
                                                            <sup className="ml-0.5">{tag.count}</sup>
                                                        </Link>
                                                    </SheetClose>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* 网站信息：与侧边栏一致，每行一条、黑色细边框、无背景 */}
                                    {(siteinfo?.totalPostCount != null ||
                                        siteinfo?.totalWordCount != null ||
                                        (siteinfo?.runtimeEnable && daysSince(siteCreatedAt) > 0)) && (
                                            <div>
                                                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                                    <FileText className="mr-1 inline size-3.5" />
                                                    网站信息
                                                </h3>
                                                <div className="mt-2 space-y-2">
                                                    {siteinfo.totalPostCount != null && (
                                                        <div className="flex items-center justify-between rounded-lg border border-foreground/25 px-3 py-2 text-sm">
                                                            <span className="text-muted-foreground">文章总数</span>
                                                            <span className="font-medium">{siteinfo.totalPostCount}</span>
                                                        </div>
                                                    )}
                                                    {siteinfo.totalWordCount != null && (
                                                        <div className="flex items-center justify-between rounded-lg border border-foreground/25 px-3 py-2 text-sm">
                                                            <span className="text-muted-foreground">全站字数</span>
                                                            <span className="font-medium">{siteinfo.totalWordCount.toLocaleString()}</span>
                                                        </div>
                                                    )}
                                                    {siteinfo.runtimeEnable && daysSince(siteCreatedAt) > 0 && (
                                                        <div className="flex items-center justify-between rounded-lg border border-foreground/25 px-3 py-2 text-sm">
                                                            <span className="text-muted-foreground">建站天数</span>
                                                            <span className="font-medium">{daysSince(siteCreatedAt)} 天</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                </div>
                            </SheetContent>
                        </Sheet>
                    </div>
                    <UserMenu isLoggedIn={isLoggedIn} scrolled={scrolled} userpanel={userpanel} userAvatar={userAvatar} />
                </div>
            </div>
        </>
    )
}
