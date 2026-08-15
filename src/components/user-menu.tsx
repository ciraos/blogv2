"use client";

import Link from "next/link";
import { LogIn, User, UserPlus } from "lucide-react";

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface UserMenuProps {
    /** 是否已登录（由服务端读取 httpOnly cookie 传入） */
    isLoggedIn: boolean;
}

/** 导航栏最右侧的用户菜单 */
export function UserMenu({ isLoggedIn }: UserMenuProps) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-label="用户菜单"
                >
                    <User className="size-5" />
                </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-60">
                {isLoggedIn ? (
                    /* ===== 已登录 ===== */
                    <div className="flex flex-col items-center gap-1 px-2 py-4 text-center">
                        <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                            <User className="size-7" />
                        </div>
                        <div className="mt-2 text-base font-semibold">已登录</div>
                        <div className="text-xs text-muted-foreground">欢迎回来</div>
                        <Link
                            href="/api/auth/logout"
                            className="mt-3 w-full rounded-lg border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
                        >
                            退出登录
                        </Link>
                    </div>
                ) : (
                    /* ===== 未登录 ===== */
                    <div className="flex flex-col items-center gap-1 px-2 py-4 text-center">
                        {/* 居中用户图标 */}
                        <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                            <User className="size-7" />
                        </div>

                        {/* 稍大一点的标题 */}
                        <div className="mt-2 text-base font-semibold">欢迎访问</div>

                        {/* 小字说明 */}
                        <div className="text-xs text-muted-foreground">登录后解锁更多功能</div>

                        {/* 登录（紫色）/ 注册 按钮 */}
                        <div className="mt-3 flex w-full gap-2">
                            <Link
                                href="/login"
                                className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-purple-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-600"
                            >
                                <LogIn className="size-4" />
                                登录
                            </Link>
                            <Link
                                href="/register"
                                className="flex flex-1 items-center justify-center gap-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
                            >
                                <UserPlus className="size-4" />
                                注册
                            </Link>
                        </div>
                    </div>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
