import Link from "next/link";
import { BookOpenText, Link2, MessageSquare, PenLine, Settings, Upload } from "lucide-react";

/** 快速操作：6 个入口按钮，图标在上、文字在下、居中，浅色底 + 同色系深色文字（含深色模式适配） */
const ACTIONS = [
    { label: "写文章", href: "/admin/post-management", icon: PenLine, cls: "bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:hover:bg-blue-500/25" },
    { label: "上传文件", href: "/admin/file-management", icon: Upload, cls: "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:hover:bg-emerald-500/25" },
    { label: "管理评论", href: "/admin/comments", icon: MessageSquare, cls: "bg-violet-100 text-violet-700 hover:bg-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:hover:bg-violet-500/25" },
    { label: "文档系列", href: "/admin/doc-series", icon: BookOpenText, cls: "bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:hover:bg-amber-500/25" },
    { label: "友链管理", href: "/admin/friends", icon: Link2, cls: "bg-rose-100 text-rose-700 hover:bg-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:hover:bg-rose-500/25" },
    { label: "系统设置", href: "/admin/settings", icon: Settings, cls: "bg-cyan-100 text-cyan-700 hover:bg-cyan-200 dark:bg-cyan-500/15 dark:text-cyan-300 dark:hover:bg-cyan-500/25" },
];

export function QuickActions() {
    return (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {ACTIONS.map((action) => (
                <Link
                    key={action.href}
                    href={action.href}
                    className={`flex flex-col items-center justify-center gap-1 rounded-lg px-2 py-3.5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${action.cls}`}
                >
                    <action.icon className="size-4" />
                    <span className="text-xs font-medium">{action.label}</span>
                </Link>
            ))}
        </div>
    );
}
