"use client";

import Link from "next/link";
import {
    Bell,
    LayoutDashboard,
    LogIn,
    LogOut,
    PenLine,
    Quote,
    User,
    UserPlus,
} from "lucide-react";

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { UserPanelConfig } from "@/types/site-config";

interface UserMenuProps {
    /** 是否已登录（由服务端读取 httpOnly cookie 传入） */
    isLoggedIn: boolean;
    /** 页面下滑状态：true 时触发器胶囊变半透明毛玻璃（与 Header 联动） */
    scrolled?: boolean;
    /** 用户面板开关（来自 site-config userpanel，登录态菜单项按开关显示） */
    userpanel?: UserPanelConfig;
}

/** 菜单项（图标 + 文案 + 链接/动作） */
interface MenuItem {
    key: string;
    label: string;
    icon: React.ReactNode;
    href?: string;
    onClick?: () => void;
}

/** 导航栏最右侧的用户菜单 */
export function UserMenu({ isLoggedIn, scrolled = false, userpanel }: UserMenuProps) {
    /** 登出：清 cookie 后原地刷新，不跳转登录页 */
    async function handleLogout() {
        try {
            await fetch("/api/auth/logout?redirect=0")
        } finally {
            window.location.reload()
        }
    }

    // 登录态菜单项（按 userpanel 开关过滤；页面未就绪的暂用 toast 提示）
    const loggedInItems: MenuItem[] = [];
    if (userpanel?.show_admin_dashboard) {
        loggedInItems.push({
            key: "dashboard",
            label: "后台管理",
            icon: <LayoutDashboard className="size-4 text-muted-foreground" />,
            href: "/admin/dashboard",
        });
    }
    if (userpanel?.show_publish_article) {
        loggedInItems.push({
            key: "publish-article",
            label: "发布文章",
            icon: <PenLine className="size-4 text-muted-foreground" />,
            href: "/admin/posts/new",
        });
    }
    if (userpanel?.show_publish_essay) {
        loggedInItems.push({
            key: "publish-essay",
            label: "发布说说",
            icon: <Quote className="size-4 text-muted-foreground" />,
            href: "/admin/essay/new",
        });
    }
    if (userpanel?.show_notifications) {
        loggedInItems.push({
            key: "notifications",
            label: "通知",
            icon: <Bell className="size-4 text-muted-foreground" />,
            href: "/admin/notifications",
        });
    }
    if (userpanel?.show_user_center) {
        loggedInItems.push({
            key: "user-center",
            label: "个人中心",
            icon: <User className="size-4 text-muted-foreground" />,
            href: "/admin/profile",
        });
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger
                asChild
                className={`w-11 h-11 transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] will-change-transform ${scrolled
                    ? "scale-[0.94] bg-card/60 shadow-sm backdrop-blur-md"
                    : "scale-100 bg-card shadow-md hover:shadow-xl"
                    }`}
            >
                <button
                    className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-label="用户菜单"
                >
                    <User className="size-6" />
                </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-60">
                {isLoggedIn ? (
                    /* ===== 已登录：图标网格（图标在上文字在下，从左往右排列） ===== */
                    <div className="p-2">
                        {/* 用户信息头 */}
                        <div className="flex flex-col items-center gap-1 border-b px-2 pb-3 pt-1 text-center">
                            <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                                <User className="size-6" />
                            </div>
                            <div className="mt-1 text-sm font-semibold">已登录</div>
                            <div className="text-xs text-muted-foreground">欢迎回来</div>
                        </div>

                        {/* 图标网格：从左往右排列，每个图标在上、文字在下 */}
                        <div className="mt-2 grid grid-cols-3 gap-1">
                            {loggedInItems.map((item) =>
                                item.href ? (
                                    <Link
                                        key={item.key}
                                        href={item.href}
                                        className="flex flex-col items-center gap-1.5 rounded-lg px-1 py-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                    >
                                        {item.icon}
                                        {item.label}
                                    </Link>
                                ) : (
                                    <button
                                        key={item.key}
                                        onClick={item.onClick}
                                        className="flex w-full flex-col items-center gap-1.5 rounded-lg px-1 py-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                    >
                                        {item.icon}
                                        {item.label}
                                    </button>
                                ),
                            )}
                        </div>

                        {/* 虚线分隔 */}
                        <hr className="my-2 border-t border-dashed border-border/60" />

                        {/* 退出登录：单独一行 */}
                        <button
                            onClick={handleLogout}
                            className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-500/10"
                        >
                            <LogOut className="size-4" />
                            退出登录
                        </button>
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
