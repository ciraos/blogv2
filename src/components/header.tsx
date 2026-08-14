"use client";

import Link from "next/link";
import { Menu, SquareTerminal } from "lucide-react";

import {
    NavigationMenu,
    NavigationMenuContent,
    NavigationMenuItem,
    NavigationMenuLink,
    NavigationMenuList,
    NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
import {
    Sheet,
    SheetClose,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet";

import type { HeaderMenuGroup, HeaderMenuItem } from "@/types/site-config";

interface HeaderProps {
    /** 站点配置中的导航菜单（header.menu） */
    menu?: HeaderMenuGroup[];
    /** 站点名称 */
    appName?: string;
}

export default function Header({ menu = [], appName = "博客" }: HeaderProps) {
    return (
        <>
            <div className="header w-full max-w-300 h-12 mx-auto px-5 flex items-center justify-between bg-white rounded-xl shadow-md hover:shadow-lg">
                <Link href="/" className="hover:underline">{appName}</Link>

                {/* 桌面端导航（≥768px） */}
                {menu.length > 0 && (
                    <div className="hidden md:block">
                        <NavigationMenu>
                            <NavigationMenuList>
                                {menu.map((group) => (
                                    <NavigationMenuItem key={group.title}>
                                        <NavigationMenuTrigger>{group.title}</NavigationMenuTrigger>
                                        <NavigationMenuContent>
                                            <ul className="w-52 p-1">
                                                {group.items.map((item) => (
                                                    <ListItem key={item.path + item.title} item={item} />
                                                ))}
                                            </ul>
                                        </NavigationMenuContent>
                                    </NavigationMenuItem>
                                ))}
                            </NavigationMenuList>
                        </NavigationMenu>
                    </div>
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
                                        <h3 className="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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
                                                            className="flex items-center gap-2.5 rounded-lg px-2 py-2.5 text-sm transition-colors hover:bg-muted"
                                                        >
                                                            {item.icon && <span className={item.icon} aria-hidden="true" />}
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
                    <SquareTerminal />
                </div>
            </div>
        </>
    )
}

function ListItem({ item }: { item: HeaderMenuItem }) {
    const external = item.isExternal;
    return (
        <li className="mb-0.5">
            <NavigationMenuLink asChild>
                <Link
                    href={item.path}
                    target={external ? "_blank" : undefined}
                    rel={external ? "noopener noreferrer nofollow" : undefined}
                    className="flex items-center gap-2 rounded-md px-3 py-2 text-sm leading-none hover:bg-muted hover:text-foreground"
                >
                    {item.icon && <span className={item.icon} aria-hidden="true" />}
                    <span>{item.title}</span>
                </Link>
            </NavigationMenuLink>
        </li>
    )
}
