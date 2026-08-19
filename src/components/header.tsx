"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, Menu } from "lucide-react";

import {
    Sheet,
    SheetClose,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet";

import { UserMenu } from "@/components/user-menu";
import { cn } from "@/lib/utils";
import type { HeaderMenuGroup } from "@/types/site-config";

interface HeaderProps {
    /** 站点配置中的导航菜单（header.menu） */
    menu?: HeaderMenuGroup[];
    /** 站点名称 */
    appName?: string;
    /** 是否已登录（服务端读取 httpOnly cookie 传入） */
    isLoggedIn?: boolean;
}

export default function Header({ menu = [], appName = "博客", isLoggedIn = false }: HeaderProps) {
    // 桌面端下拉：hover 展开，一次只开一个
    const [openGroup, setOpenGroup] = useState<string | null>(null);
    // 关闭宽限期：鼠标穿过触发器与面板之间的间隙时不误关
    const closeTimer = useRef<number | null>(null);

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
            <div className="header w-full max-w-300 h-12 mx-auto px-5 flex items-center justify-between bg-card rounded-xl shadow-md hover:shadow-lg">
                <Link href="/" className="text-base font-bold tracking-tight hover:opacity-80">{appName}</Link>

                {/* 桌面端导航（≥768px）：自研下拉，面板绝对定位在触发器正下方 */}
                {menu.length > 0 && (
                    <nav className="hidden md:block">
                        <ul className="flex items-center gap-0.5">
                            {menu.map((group) => (
                                <li
                                    key={group.title}
                                    className="relative"
                                    onMouseEnter={() => handleEnter(group.title)}
                                    onMouseLeave={handleLeave}
                                >
                                    <button
                                        className={cn(
                                            "flex h-9 items-center gap-1 rounded-lg px-3 text-sm font-medium transition-colors hover:text-primary",
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

                <div className="flex items-center justify-around gap-1">
                    {/* 移动端汉堡菜单（<768px） */}
                    <Sheet>
                        <SheetTrigger asChild>
                            <button
                                className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
                                aria-label="打开菜单"
                            >
                                <Menu className="size-5" />
                            </button>
                        </SheetTrigger>
                        <SheetContent side="right" className="w-72 sm:max-w-sm">
                            <SheetHeader>
                                <SheetTitle>{appName}</SheetTitle>
                            </SheetHeader>
                            <nav className="mt-6 space-y-6 overflow-y-auto px-1 pb-6">
                                {menu.map((group) => (
                                    <div key={group.title}>
                                        <h3 className="px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                            {group.title}
                                        </h3>
                                        <ul className="mt-2 space-y-0.5">
                                            {group.items.map((item) => (
                                                <li key={item.path + item.title}>
                                                    <SheetClose asChild>
                                                        <Link
                                                            href={item.path}
                                                            target={item.isExternal ? "_blank" : undefined}
                                                            rel={item.isExternal ? "noopener noreferrer nofollow" : undefined}
                                                            className="flex items-center rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted"
                                                        >
                                                            {item.title}
                                                        </Link>
                                                    </SheetClose>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ))}
                            </nav>
                        </SheetContent>
                    </Sheet>
                    <UserMenu isLoggedIn={isLoggedIn} />
                </div>
            </div>
        </>
    )
}
