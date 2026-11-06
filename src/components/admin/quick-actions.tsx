import Link from "next/link";
import { BookOpenText, Link2, MessageSquare, PenLine, Settings, Upload } from "lucide-react";

/**
 * 快速操作：6 个入口。
 *
 * 原来是六块彩色磁贴（蓝/绿/紫/黄/粉/青 + 阴影 + 悬浮上浮），在编辑排版里太吵：
 * 这里改成「同一种纸白底 + 细描边」，只让图标保留主题色，
 * 悬浮时描边变主题色、图标轻微放大 —— 和前台列表的交互语言一致。
 */
const ACTIONS = [
    { label: "写文章", href: "/admin/post-management", icon: PenLine },
    { label: "上传文件", href: "/admin/file-management", icon: Upload },
    { label: "管理评论", href: "/admin/comments", icon: MessageSquare },
    { label: "文档系列", href: "/admin/doc-series", icon: BookOpenText },
    { label: "友链管理", href: "/admin/friends", icon: Link2 },
    { label: "系统设置", href: "/admin/settings", icon: Settings },
];

export function QuickActions() {
    return (
        <div className="grid grid-cols-3 gap-2 lg:grid-cols-6">
            {ACTIONS.map((action) => (
                <Link
                    key={action.href}
                    href={action.href}
                    className="group flex flex-col items-center justify-center gap-1.5 rounded-lg border bg-card px-2 py-3.5 transition-colors hover:border-primary/50"
                >
                    <action.icon className="size-4 text-primary transition-transform group-hover:scale-110" />
                    <span className="text-xs font-medium text-foreground">{action.label}</span>
                </Link>
            ))}
        </div>
    );
}
