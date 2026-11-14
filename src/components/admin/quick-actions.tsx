import Link from "next/link";
import { BookOpenText, Link2, MessageSquare, PenLine, Settings, Upload } from "lucide-react";

/**
 * 快速操作：6 个入口。
 *
 * 原来是六块彩色磁贴（蓝/绿/紫/黄/粉/青 + 阴影 + 悬浮上浮），后来收成了「同一种纸白底 + 细描边」。
 * 但六块**一样大、一样重**的格子仍然是模板：没有告诉人「这里最常点的是哪一个」。
 *
 * 这一版只做一件事：**让第一个入口成为主操作**（实心），其余五个退成细线面。
 * 同时去掉图标 `group-hover:scale-110` —— 悬停时图标放大属于“没有解释任何事情的动效”，
 * 换个底色就够了。图标也不再单独上主题色，跟着文字走同一个文字色。
 */
const PRIMARY = { label: "写文章", href: "/admin/post-management", icon: PenLine };

const ACTIONS = [
    { label: "上传文件", href: "/admin/file-management", icon: Upload },
    { label: "管理评论", href: "/admin/comments", icon: MessageSquare },
    { label: "文档系列", href: "/admin/doc-series", icon: BookOpenText },
    { label: "友链管理", href: "/admin/friends", icon: Link2 },
    { label: "系统设置", href: "/admin/settings", icon: Settings },
];

export function QuickActions() {
    return (
        <div className="grid grid-cols-3 gap-2 lg:grid-cols-6">
            <Link
                href={PRIMARY.href}
                className="group flex flex-col items-center justify-center gap-1.5 rounded-lg border border-primary bg-primary px-2 py-3.5 text-primary-foreground transition-colors hover:bg-primary/90"
            >
                <PRIMARY.icon className="size-4" />
                <span className="text-xs font-medium">{PRIMARY.label}</span>
            </Link>
            {ACTIONS.map((action) => (
                <Link
                    key={action.href}
                    href={action.href}
                    className="group flex flex-col items-center justify-center gap-1.5 soft-surface px-2 py-3.5 text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground"
                >
                    <action.icon className="size-4" />
                    <span className="text-xs font-medium">{action.label}</span>
                </Link>
            ))}
        </div>
    );
}
