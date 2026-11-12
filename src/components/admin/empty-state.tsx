import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type EmptyKind =
    | "articles"
    | "comments"
    | "links"
    | "users"
    | "orders"
    | "media"
    | "search"
    | "generic";

/**
 * 空状态：一页没有数据时的那一段。
 *
 * 原来全站共用一句话「暂无数据」，顶多再配一个灰度插画，读者看不出这是
 * 「你还没写过」还是「筛选条件太窄」。这里按页面类型给不同轮廓——
 * 文字页是叠起来的两张纸、评论是气泡、友链是两点连线、订单是票根、
 * 媒体是带山的相框；再配一句只说这一页的话。
 * 全部是 1.25px 发丝线条，不上色、不用 emoji、不做渐变。
 */
const GLYPHS: Record<EmptyKind, ReactNode> = {
    articles: (
        <>
            <rect x="19" y="7" width="17" height="22" rx="2" />
            <rect x="12" y="15" width="17" height="22" rx="2" />
            <path d="M17 23h7M17 28h5" />
        </>
    ),
    comments: (
        <>
            <rect x="10" y="11" width="28" height="19" rx="3" />
            <path d="M18 30v7l8-7" />
            <path d="M16 18h16M16 23h10" />
        </>
    ),
    links: (
        <>
            <circle cx="18" cy="24" r="7.5" />
            <circle cx="30" cy="24" r="7.5" />
        </>
    ),
    users: (
        <>
            <circle cx="24" cy="18" r="6.5" />
            <path d="M11 39c0-7 6-11 13-11s13 4 13 11" />
        </>
    ),
    orders: (
        <>
            <path d="M14 8h20v32l-4-3-4 3-4-3-4 3-4-3V8Z" />
            <path d="M19 16h10M19 22h10M19 28h6" />
        </>
    ),
    media: (
        <>
            <rect x="9" y="13" width="30" height="23" rx="2.5" />
            <circle cx="18" cy="21" r="2.5" />
            <path d="M12 34l8-8 6 6 5-5 9 9" />
        </>
    ),
    search: (
        <>
            <circle cx="22" cy="22" r="9.5" />
            <path d="M29 29l8 8" />
            <path d="M18 23h8" />
        </>
    ),
    generic: (
        <>
            <path d="M11 24h9M28 24h9" />
            <circle cx="24" cy="24" r="2.5" />
        </>
    ),
};

const DEFAULTS: Record<EmptyKind, { title: string; description: string }> = {
    articles: { title: "还没有文章", description: "写下第一篇，它会按时间排在列表最前面" },
    comments: { title: "还没有评论", description: "读者留言后会出现在这里，可以逐条审核" },
    links: { title: "还没有友链", description: "对方提交申请后，通过审核就会显示在列表里" },
    users: { title: "还没有用户", description: "注册用户会出现在这里，可在这里改用户组和状态" },
    orders: { title: "还没有订单", description: "有成交后在这里对账、发货和退款" },
    media: { title: "这个目录是空的", description: "拖入文件、或点右上角上传就能看到" },
    search: { title: "没有匹配的结果", description: "换个关键词，或者清除筛选条件再看看" },
    generic: { title: "这里还是空的", description: "有了内容就会出现在这里" },
};

interface AdminEmptyStateProps {
    kind?: EmptyKind;
    title?: string;
    description?: string;
    /** 有筛选条件时用：换成放大镜轮廓和「没有匹配的结果」，避免和「还没创建」混淆 */
    filtered?: boolean;
    action?: ReactNode;
    className?: string;
}

export function AdminEmptyState({
    kind = "generic",
    title,
    description,
    filtered,
    action,
    className,
}: AdminEmptyStateProps) {
    const shape: EmptyKind = filtered ? "search" : kind;
    const fallback = DEFAULTS[shape];
    return (
        <div className={cn("flex flex-col items-center justify-center px-6 py-16 text-center", className)}>
            <svg
                viewBox="0 0 48 48"
                aria-hidden
                className="size-11 text-muted-foreground/50"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.25"
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                {GLYPHS[shape]}
            </svg>
            <p className="mt-4 text-[13px] font-medium">{title ?? fallback.title}</p>
            <p className="mt-1 max-w-[36ch] text-xs leading-relaxed text-muted-foreground">
                {description ?? fallback.description}
            </p>
            {action && <div className="mt-4 flex items-center gap-2">{action}</div>}
        </div>
    );
}
