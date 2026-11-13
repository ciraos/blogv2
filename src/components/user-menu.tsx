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
    /** @deprecated 触发器已不再随滚动变形；保留字段只为兼容 Header 的透传 */
    scrolled?: boolean;

    /** 用户面板开关（来自 site-config userpanel，登录态菜单项按开关显示） */
    userpanel?: UserPanelConfig;
    /** 已登录用户的头像 URL（服务端传入；登录态下改显示昵称首字） */
    userAvatar?: string | null;
    /** 已登录用户的昵称（服务端传入；登录态下触发器显示首字） */
    userName?: string | null;
    /** 是否管理员（服务端按用户组判断）：仅管理员显示「发布文章 / 发布说说 / 后台管理」 */
    isAdmin?: boolean;
    /** 页面大图悬浮模式：true 时触发器透明（白字悬浮大图上，不显示白胶囊） */
    overlay?: boolean;
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
export function UserMenu({ isLoggedIn, userpanel, userName, isAdmin = false, overlay = false }: UserMenuProps) {
    /** 登出：清 cookie 后原地刷新，不跳转登录页 */
    async function handleLogout() {
        try {
            await fetch("/api/auth/logout?redirect=0")
        } finally {
            window.location.reload()
        }
    }

    // 登录态菜单项：
    // - 用户中心 / 全部通知：所有登录用户可见（走前台路由 /user-center、/notifications）
    // - 发布文章 / 发布说说 / 后台管理：仅管理员可见（与官方 HeaderRight 一致）
    // 各项仍受 site-config userpanel 开关控制
    const loggedInItems: MenuItem[] = [];
    if (userpanel?.show_user_center) {
        loggedInItems.push({
            key: "user-center",
            label: "用户中心",
            icon: <User className="size-4 text-muted-foreground" />,
            href: "/user-center",
        });
    }
    if (userpanel?.show_notifications) {
        loggedInItems.push({
            key: "notifications",
            label: "全部通知",
            icon: <Bell className="size-4 text-muted-foreground" />,
            href: "/notifications",
        });
    }
    if (isAdmin && userpanel?.show_publish_article) {
        loggedInItems.push({
            key: "publish-article",
            label: "发布文章",
            icon: <PenLine className="size-4 text-muted-foreground" />,
            href: "/admin/post-management",
        });
    }
    if (isAdmin && userpanel?.show_publish_essay) {
        loggedInItems.push({
            key: "publish-essay",
            label: "发布说说",
            icon: <Quote className="size-4 text-muted-foreground" />,
            href: "/admin/essays",
        });
    }
    if (isAdmin && userpanel?.show_admin_dashboard) {
        loggedInItems.push({
            key: "dashboard",
            label: "后台管理",
            icon: <LayoutDashboard className="size-4 text-muted-foreground" />,
            href: "/admin/dashboard",
        });
    }

    return (
        <DropdownMenu>
            {/* 触发器与左侧搜索按钮同款：无底色、无阴影、无缩放，方角 6px，hover 才出浅底。
                原来是一个 bg-card + shadow-md 的悬浮圆胶囊 + 弹性缩放动画，和扁平导航完全两套语言。 */}
            <DropdownMenuTrigger asChild>
                {isLoggedIn ? (
                    /* 已登录：首字做成描边小圆牌（monogram），不填色 */
                    <button
                        className={`inline-flex size-11 shrink-0 items-center justify-center rounded-md transition-colors ${
                            overlay
                                ? "text-white hover:bg-white/10"
                                : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}
                        aria-label="用户菜单"
                    >
                        <span
                            className={`flex size-7 items-center justify-center rounded-full border text-xs font-medium ${
                                overlay ? "border-white/50" : "border-border"
                            }`}
                        >
                            {(userName || "用").charAt(0)}
                        </span>
                    </button>
                ) : (
                    /* 未登录：和搜索同款的线性图标按钮 */
                    <button
                        className={`inline-flex size-11 items-center justify-center rounded-md transition-colors ${
                            overlay
                                ? "text-white hover:bg-white/10"
                                : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}
                        aria-label="用户菜单"
                    >
                        <User className="size-5" />
                    </button>
                )}
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

                        {/* 图标网格：从左往右排列，每个图标在上、文字在下；
                            退出登录也是同款网格项，仅配色用警示色 */}
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
                            <button
                                type="button"
                                onClick={handleLogout}
                                className="flex w-full flex-col items-center gap-1.5 rounded-lg px-1 py-3 text-xs font-medium text-red-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
                            >
                                <LogOut className="size-4" />
                                退出登录
                            </button>
                        </div>
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
