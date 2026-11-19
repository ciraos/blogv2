"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { ChevronDown, FileText, Menu, Moon, Sun, Tag as TagIcon } from "lucide-react";

import { clearAutoThemeManagement } from "@/lib/scheduled-theme";

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
import { HeaderClock } from "@/components/(blog)/header-clock";
import { HeaderTravelling } from "@/components/(blog)/header-travelling";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { OneImagePayload } from "@/components/(blog)/one-image-hero";
import type { HeaderMenuGroup, UserPanelConfig } from "@/types/site-config";

/** pathname → 页面 key（与 OneImageHero 一致，用于判断当前页是否启用大图） */
function matchOneImageKey(pathname: string): keyof OneImagePayload["config"] | null {
    if (pathname === "/") return "home";
    if (pathname === "/archives") return "archives";
    if (pathname === "/tags") return "tags";
    if (pathname === "/categories") return "categories";
    return null;
}

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
    /** 已登录用户的昵称（服务端从用户信息获取；登录态下触发器改显示首字） */
    userName?: string | null;
    /** 是否管理员（服务端按用户组判断）：决定用户菜单里是否显示后台 / 发布入口 */
    isAdmin?: boolean;
    /** 移动端汉堡菜单：标签云（服务端聚合后传入） */
    mobileTags?: { id: string; name: string; count: number }[];
    /** 移动端汉堡菜单：网站信息（文章数/字数/建站天数开关，与侧边栏一致） */
    siteinfo?: { runtimeEnable: boolean; totalPostCount: number; totalWordCount: number };
    /** 移动端汉堡菜单：建站起点（归档最早月份，用于计算建站天数） */
    siteCreatedAt?: string;
    /** 页面大图配置（page.one_image 载荷）：当前页启用时 Header 透明悬浮大图上 */
    oneImage?: OneImagePayload;
    /** 页头时钟（header.nav.clock）：开启后在搜索按钮左侧显示 HH:MM */
    showClock?: boolean;
    /** 开往 travelling 入口（header.nav.travelling）：仅首页桌面端显示 */
    showTravelling?: boolean;
}

/** 站点建站天数（按最新文章日期估算，与侧边栏一致） */
function daysSince(createdAt?: string): number {
    if (!createdAt) return 0;
    const start = new Date(createdAt).getTime();
    if (Number.isNaN(start)) return 0;
    return Math.max(1, Math.floor((Date.now() - start) / 86400000));
}

/** 需要新标签页打开的站内菜单路径：这些路由服务端会 302 跳到外站（/travelling 随机友链），
 *  同标签打开会直接离开本站，故按外链处理 */
const NEW_TAB_PATHS = new Set(["/travelling"]);
/** 是否新标签页打开：外链（isExternal）或跳转外站的站内路由 */
function opensInNewTab(isExternal: boolean | undefined, path: string): boolean {
    return !!isExternal || NEW_TAB_PATHS.has(path.replace(/\/+$/, ""));
}

/**
 * 页头外观（`.env` 里的 `NEXT_PUBLIC_HEADER_STYLE`）：
 *  · 0 = 原来的通栏样式（发丝下边线 + 站名 + 导航 + 图标，没有浮岛）
 *  · 1 = 灵动岛（浮在页面上的窄胶囊，点「导航」向下展开分组面板）
 *  · 2 = 胶囊导航（点「导航」让胶囊横向展开，导航项淡入居中）
 * 其他值/未设置 → 0（保持改动前的样子）。
 *
 * 注意：`NEXT_PUBLIC_*` 是**构建期内联**的，改完要重启 dev（或重新 build）才生效。
 */
const HEADER_STYLE: 0 | 1 | 2 = (() => {
    const raw = (process.env.NEXT_PUBLIC_HEADER_STYLE ?? "").trim();
    return raw === "1" ? 1 : raw === "2" ? 2 : 0;
})();

export default function Header({ menu = [], appName = "博客", isLoggedIn = false, userpanel, userAvatar, userName, isAdmin = false, mobileTags = [], siteinfo, siteCreatedAt, oneImage, showClock = false, showTravelling = false }: HeaderProps) {
    const styleMode = HEADER_STYLE;
    // 下滑超过阈值时胶囊背景变半透明毛玻璃，回到顶部恢复
    const [scrolled, setScrolled] = useState(false);
    const islandRef = useRef<HTMLDivElement>(null);
    // 深浅色切换（移动端汉堡菜单"功能"区块）
    const { setTheme } = useTheme();
    // 当前路径（用于判断大图悬浮、以及"展开态/下拉开在哪一页"）
    const pathname = usePathname();
    const heroKey = matchOneImageKey(pathname);
    const heroEnabled = !!heroKey && !!oneImage?.config?.[heroKey]?.enable;
    /**
     * 胶囊导航的展开态：**点击**展开，不跟 hover。
     *
     * 为什么改成点击驱动：胶囊是居中的，一拉伸左边缘就左移，站名跟着跑 ——
     * hover 展开时用户正要点站名回首页，它刚好挪走（实测点空、回不了首页）；
     * 而且 hover 触发的拉伸还会让「被悬停的按钮」自己跑掉，导致展开/收起抖动。
     * 点击没有这个问题：指针不必停在某个会移动的元素上，站名也只在展开后才换位置（看得见）。
     */
    const [navExpandedAt, setNavExpandedAt] = useState<string | null>(null);
    // 连 path 一起记：换页后自动收起（省掉 effect 里 setState）
    const navExpanded = navExpandedAt !== null && navExpandedAt === pathname;
    const setNavExpanded = (next: boolean) => setNavExpandedAt(next ? (pathname ?? "") : null);

    // 下拉分组（一次只开一个；同样带 path，换页自动失效）
    const [openState, setOpenState] = useState<{ group: string; path: string } | null>(null);
    const openGroup = openState && openState.path === pathname ? openState.group : null;
    // 关闭宽限期：鼠标穿过触发器与面板之间的间隙时不误关
    const closeTimer = useRef<number | null>(null);

    // 点岛外面 / 按 Esc / 按 P 关闭：收起胶囊并收起下拉
    useEffect(() => {
        if (!navExpanded) return;
        const onDown = (event: PointerEvent) => {
            if (!islandRef.current?.contains(event.target as Node)) {
                setNavExpandedAt(null);
                setOpenState(null);
            }
        };
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setNavExpandedAt(null);
                setOpenState(null);
            }
        };
        document.addEventListener("pointerdown", onDown);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("pointerdown", onDown);
            document.removeEventListener("keydown", onKey);
        };
    }, [navExpanded]);

    function handleEnter(title: string) {
        if (closeTimer.current !== null) {
            window.clearTimeout(closeTimer.current);
            closeTimer.current = null;
        }
        setOpenState({ group: title, path: pathname ?? "" });
    }

    function handleLeave() {
        closeTimer.current = window.setTimeout(() => setOpenState(null), 150);
    }

    useEffect(() => {
        // hero 页：滚动超过首屏高度才视为 scrolled（header 一直悬浮大图顶部）；
        // 普通页：滚动 40px 即触发
        const threshold = heroEnabled ? window.innerHeight * 0.9 : 40;
        const onScroll = () => setScrolled(window.scrollY > threshold);
        // React Compiler 规则：effect 内不直接同步 setState，用宏任务包裹初始求值
        const t = setTimeout(onScroll, 0);
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => {
            clearTimeout(t);
            window.removeEventListener("scroll", onScroll);
        };
    }, [heroEnabled]);

    // 编辑部风：导航不再用「胶囊」承载，改成通栏细线 + 衬线站名。
    // hero 首屏仍然透明悬浮在大图上（白字 + 投影），滚动离开后有底色与发丝下边线。
    const heroOverlay = heroEnabled && !scrolled;
    const textCls = heroOverlay
        ? "text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.45)] [&_button]:text-white"
        : "text-foreground";

    /** 当前所在分区（窄岛上的「现在在哪」+ 导航面板里高亮所在分组；取路径匹配最深的一项） */
    const current = useMemo(() => {
        const path = (pathname ?? "/").replace(/\/+$/, "") || "/";
        let best: { item: string; group: string; depth: number } | null = null;
        for (const group of menu) {
            for (const item of group.items) {
                const itemPath = (item.path ?? "").replace(/\/+$/, "") || "/";
                if (itemPath === "/" || !itemPath) continue;
                if (path === itemPath || path.startsWith(`${itemPath}/`)) {
                    if (!best || itemPath.length > best.depth) {
                        best = { item: item.title, group: group.title, depth: itemPath.length };
                    }
                }
            }
        }
        return { item: best?.item ?? "", group: best?.group ?? "" };
    }, [menu, pathname]);

    return (
        <>
            {/* 外壳：0 = 原来的通栏条；1/2 = 透明层里浮一个胶囊（hero 页的 -mt-16 补偿仍然成立） */}
            <div
                className={cn(
                    styleMode === 0
                        ? cn(
                              "header sticky top-0 z-50 mx-auto flex h-14 w-full max-w-300 items-center justify-between border-b px-2 transition-colors sm:px-0",
                              heroOverlay
                                  ? "border-transparent bg-transparent text-white"
                                  : // 深色下页面底色本身就接近纯黑，用 card 档（比 background 亮一档）
                                    // 才不会「header 和背景一个颜色」；浅色下用白底比 #f4f4f4 的页面亮
                                    "border-border/60 bg-white/85 text-foreground backdrop-blur-md dark:border-white/10 dark:bg-card/80"
                          )
                        : "header sticky top-0 z-50 mx-auto w-full max-w-300 px-2 pt-2.5 pb-1.5 sm:px-0"
                )}
            >
                <div
                    ref={islandRef}
                    className={
                        styleMode === 0
                            ? // 通栏模式：这层只是为了让三种模式共用同一份子元素，display:contents 让它不参与布局
                              "contents"
                            : cn(
                                  "relative mx-auto flex h-12 items-center justify-between gap-2 rounded-full border px-3",
                                  styleMode === 2
                                      ? // 胶囊：点击横向展开（宽度动画；站名只在展开后换位，看得见）
                                        "transition-[width,background-color,border-color,box-shadow] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none"
                                      : // 灵动岛：宽度恒定，导航向下展开成面板
                                        "w-[min(92vw,520px)] transition-colors duration-200 motion-reduce:transition-none",
                                  styleMode === 2 &&
                                      (navExpanded ? "w-[min(94vw,560px)] md:w-[min(96vw,940px)]" : "w-[min(92vw,460px)]"),
                                  heroOverlay
                                      ? "border-white/25 bg-black/10 text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.45)] [&_button]:text-white"
                                      : cn(
                                            // 浮岛/胶囊要「浮」起来：浅色用比页面更亮的白，
                                            // 深色用比背景亮一档的 card + 明显的白描边与投影，
                                            // 否则深色下胶囊和背景糊成一片（用户反馈）。
                                            "border-black/5 bg-white/85 text-foreground shadow-[0_8px_28px_-14px_rgba(0,0,0,0.28)] backdrop-blur-xl",
                                            "dark:border-white/15 dark:bg-card/90 dark:shadow-[0_10px_34px_-12px_rgba(0,0,0,0.75)]",
                                            scrolled &&
                                                "bg-white/95 shadow-[0_10px_34px_-16px_rgba(0,0,0,0.45)] dark:bg-card"
                                        )
                              )
                    }
                >
                    <div className="flex min-w-0 items-center gap-2">
                        <Link
                            href="/"
                            className={cn(
                                "editorial-serif text-xl font-bold tracking-tight transition-opacity hover:opacity-70",
                                styleMode === 0 ? "py-2 pr-3" : "py-2 pr-1",
                                textCls
                            )}
                        >
                            {appName}
                        </Link>
                        {/* 「现在在哪」：一枚状态芯片（通栏模式沿用原样，不显示） */}
                        {styleMode !== 0 && current.item && !(styleMode === 2 && navExpanded) && (
                            <span className="hidden shrink-0 items-center rounded-full bg-muted/70 px-2.5 py-1 text-xs text-muted-foreground md:inline-flex">
                                {current.item}
                            </span>
                        )}
                    </div>

                    {/* ---------- 通栏模式：原来的桌面导航（hover 展开分组） ---------- */}
                    {styleMode === 0 && menu.length > 0 && (
                        <nav className="hidden md:block">
                            <ul className="flex items-center gap-6">
                                {menu.map((group) => (
                                    <li
                                        key={group.title}
                                        className="relative"
                                        onMouseEnter={() => handleEnter(group.title)}
                                        onMouseLeave={handleLeave}
                                    >
                                        <button
                                            className={cn(
                                                "flex h-9 items-center gap-1 rounded-lg px-3 text-base font-medium transition-colors",
                                                heroOverlay
                                                    ? "hover:text-white hover:[text-shadow:0_1px_3px_rgba(0,0,0,0.45)]"
                                                    : "hover:text-primary",
                                                openGroup === group.title && (heroOverlay ? "text-white" : "text-primary")
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

                                        {openGroup === group.title && (
                                            <div className="absolute left-1/2 top-full z-50 w-max min-w-28 -translate-x-1/2 border bg-popover p-1.5 text-popover-foreground shadow-md [text-shadow:none]">
                                                <ul className="space-y-1 [text-shadow:none]">
                                                    {group.items.map((item) => (
                                                        <li key={item.path + item.title}>
                                                            <Link
                                                                href={item.path}
                                                                target={opensInNewTab(item.isExternal, item.path) ? "_blank" : undefined}
                                                                rel={item.isExternal ? "noopener noreferrer nofollow" : opensInNewTab(item.isExternal, item.path) ? "noopener noreferrer" : undefined}
                                                                className="flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-transparent px-3 py-2.5 text-center text-sm transition-colors hover:bg-primary hover:text-primary-foreground"
                                                            >
                                                                <Icon name={item.icon} className="text-sm" />
                                                                <span>{item.title}</span>
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

                    {/* ---------- 胶囊模式：展开后导航项居中淡入（绝对定位，不挤动胶囊） ---------- */}
                    {styleMode === 2 && menu.length > 0 && (
                        <nav
                            id="island-nav"
                            className={cn(
                                // 只包住导航项本身（w-max 居中），不要铺满整条胶囊 ——
                                // 铺满会盖住右侧的展开/收起按钮，点不到（实测会被 nav 拦截点击）
                                "pointer-events-none absolute left-1/2 hidden -translate-x-1/2 justify-center transition-opacity duration-200 md:flex",
                                navExpanded ? "opacity-100 delay-[90ms]" : "opacity-0"
                            )}
                        >
                            <ul className={cn("flex items-center gap-1", navExpanded && "pointer-events-auto")}>
                                {menu.map((group) => (
                                    <li
                                        key={group.title}
                                        className="relative"
                                        onMouseEnter={() => handleEnter(group.title)}
                                        onMouseLeave={handleLeave}
                                    >
                                        <button
                                            className={cn(
                                                "flex h-9 items-center gap-1 rounded-full px-2.5 text-[15px] font-medium transition-colors",
                                                heroOverlay
                                                    ? "hover:bg-white/10 hover:text-white"
                                                    : "hover:bg-muted hover:text-primary",
                                                current.group === group.title && (heroOverlay ? "text-white" : "text-primary"),
                                                openGroup === group.title && (heroOverlay ? "text-white" : "text-primary")
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

                                        {navExpanded && openGroup === group.title && (
                                            <div className="absolute left-1/2 top-full z-50 mt-3 w-max min-w-28 -translate-x-1/2 rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-lg [text-shadow:none]">
                                                <ul className="space-y-1 [text-shadow:none]">
                                                    {group.items.map((item) => (
                                                        <li key={item.path + item.title}>
                                                            <Link
                                                                href={item.path}
                                                                target={opensInNewTab(item.isExternal, item.path) ? "_blank" : undefined}
                                                                rel={item.isExternal ? "noopener noreferrer nofollow" : opensInNewTab(item.isExternal, item.path) ? "noopener noreferrer" : undefined}
                                                                className="flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-transparent px-3 py-2.5 text-center text-sm transition-colors hover:bg-primary hover:text-primary-foreground"
                                                            >
                                                                <Icon name={item.icon} className="text-sm" />
                                                                <span>{item.title}</span>
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

                    {/* ---------- 灵动岛模式：导航向下展开成一张分组面板（胶囊本身不改变宽度） ---------- */}
                    {styleMode === 1 && navExpanded && menu.length > 0 && (
                        <div
                            id="island-nav"
                            className="absolute left-1/2 top-full z-50 mt-3 w-[min(94vw,900px)] -translate-x-1/2 rounded-2xl border bg-popover/95 p-4 text-popover-foreground shadow-xl backdrop-blur-xl [text-shadow:none]"
                        >
                            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                                {menu.map((group) => (
                                    <div key={group.title}>
                                        <div
                                            className={cn(
                                                "text-[11px] font-semibold uppercase tracking-wider",
                                                current.group === group.title ? "text-primary" : "text-muted-foreground"
                                            )}
                                        >
                                            {group.title}
                                        </div>
                                        <ul className="mt-2 space-y-0.5">
                                            {group.items.map((item) => (
                                                <li key={item.path + item.title}>
                                                    <Link
                                                        href={item.path}
                                                        target={opensInNewTab(item.isExternal, item.path) ? "_blank" : undefined}
                                                        rel={item.isExternal ? "noopener noreferrer nofollow" : opensInNewTab(item.isExternal, item.path) ? "noopener noreferrer" : undefined}
                                                        className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-foreground/85 transition-colors hover:bg-muted hover:text-primary"
                                                    >
                                                        <Icon name={item.icon} className="text-sm text-muted-foreground" />
                                                        <span>{item.title}</span>
                                                    </Link>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                <div className="flex shrink-0 items-center gap-1 md:gap-1.5">
                    {/* 显式入口：看得出「这里有菜单」（通栏模式不加，保持原样）。
                        放在右侧图标簇里 —— 放在胶囊中间会被绝对居中的 nav 压住，点不到。 */}
                    {styleMode !== 0 && menu.length > 0 && (
                        <button
                            type="button"
                            onClick={() => {
                                setNavExpanded(!navExpanded);
                                setOpenState(null);
                            }}
                            aria-expanded={navExpanded}
                            aria-controls="island-nav"
                            aria-label={navExpanded ? "收起导航" : "展开导航"}
                            className={cn(
                                "hidden h-8 shrink-0 items-center gap-1 rounded-full px-2.5 text-[13px] font-medium transition-colors md:inline-flex",
                                heroOverlay
                                    ? "hover:bg-white/10 hover:text-white"
                                    : "text-muted-foreground hover:bg-muted hover:text-primary",
                                navExpanded && (heroOverlay ? "bg-white/10 text-white" : "bg-muted text-primary")
                            )}
                        >
                            <Menu className="size-3.5" aria-hidden />
                            <span className="hidden lg:inline">{navExpanded ? "收起" : "导航"}</span>
                            <ChevronDown
                                className={cn("size-3.5 transition-transform duration-200", navExpanded && "rotate-180")}
                                aria-hidden
                            />
                        </button>
                    )}

                    {/* 搜索 + 移动端汉堡：都收进岛里，桌面端汉堡隐藏、搜索保留 */}
                    <div className="flex items-center gap-0.5">
                        {/* 开往 travelling 入口：仅首页 + 桌面端（原主题口径） */}
                        {showTravelling && pathname === "/" && <HeaderTravelling />}

                        {/* 页头时钟（header.nav.clock）：搜索按钮左侧，只在 ≥sm 显示 */}
                        {showClock && <HeaderClock />}

                        {/* 站内搜索：点击放大镜弹出搜索对话框 */}
                        <SearchDialog />

                        {/* 移动端汉堡菜单（<768px），与搜索按钮共用胶囊背景 */}
                        <Sheet>
                            <SheetTrigger asChild>
                                <button
                                    className="inline-flex size-10 items-center justify-center text-muted-foreground transition-colors hover:text-primary md:hidden"
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
                                            onClick={() => {
                                                // 手动切主题：解除「定时主题」托管（否则到下一个时段边界会被自动改回去）
                                                clearAutoThemeManagement();
                                                setTheme(document.documentElement.classList.contains("dark") ? "light" : "dark");
                                            }}
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
                                                                target={opensInNewTab(item.isExternal, item.path) ? "_blank" : undefined}
                                                                rel={item.isExternal ? "noopener noreferrer nofollow" : opensInNewTab(item.isExternal, item.path) ? "noopener noreferrer" : undefined}
                                                                className="flex min-h-15 flex-col items-center justify-center gap-1 rounded-lg bg-muted px-2 py-2.5 text-center text-sm text-muted-foreground transition-colors hover:bg-primary hover:text-primary-foreground"
                                                            >
                                                                <Icon name={item.icon} className="text-base leading-none" />
                                                                <span>{item.title}</span>
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
                    <UserMenu isLoggedIn={isLoggedIn} scrolled={scrolled} overlay={heroOverlay} userpanel={userpanel} userAvatar={userAvatar} userName={userName} isAdmin={isAdmin} />
                </div>
                </div>
            </div>
        </>
    )
}
