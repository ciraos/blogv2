import Link from "next/link";
import {
    BookOpen,
    Camera,
    Compass,
    Dice5,
    History,
    Mail,
    MessageSquareQuote,
    Music4,
    Wrench,
} from "lucide-react";

/**
 * 关于页的静态内容区（数据由 page.tsx 取好传进来，这里只负责排版）：
 *   数据一览 → 本站地图 → 最近动态 → 装备
 * 都是服务端组件，没有客户端状态。
 */

// ===================== 数据一览 =====================

export function AboutStatsGrid({
    stats,
}: {
    stats: { label: string; value: number; unit: string; note: string }[];
}) {
    return (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {stats.map((item) => (
                <div key={item.label} className="rounded-xl border bg-card p-4 text-center shadow-sm">
                    <div className="text-2xl font-semibold tabular-nums text-foreground">
                        {item.value}
                        <span className="ml-1 text-xs font-normal text-muted-foreground">{item.unit}</span>
                    </div>
                    <div className="mt-1 text-sm font-medium text-foreground">{item.label}</div>
                    <div className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{item.note}</div>
                </div>
            ))}
        </div>
    );
}

// ===================== 本站地图 =====================

const SITE_MAP = [
    { href: "/music", icon: Music4, title: "音乐馆", desc: "点开就听，跨页不断" },
    { href: "/essay", icon: MessageSquareQuote, title: "说说", desc: "短句与碎念" },
    { href: "/album", icon: Camera, title: "相册集", desc: "生活碎片" },
    { href: "/travelling", icon: Compass, title: "宝藏博主", desc: "别人的好地方" },
    { href: "/equipment", icon: Wrench, title: "我的装备", desc: "吃饭的家伙" },
    { href: "/update", icon: History, title: "更新日志", desc: "这个站怎么长大的" },
    { href: "/archives", icon: BookOpen, title: "全部文章", desc: "按时间归档" },
    { href: "/random-post", icon: Dice5, title: "随便逛逛", desc: "随机一篇" },
    { href: "/recentcomments", icon: Mail, title: "最近评论", desc: "想聊点什么" },
];

export function AboutSiteMap({ items = SITE_MAP }: { items?: typeof SITE_MAP }) {
    return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map(({ href, icon: Icon, title, desc }) => (
                <Link
                    key={href}
                    href={href}
                    className="group flex items-center gap-3 rounded-xl border bg-card p-3 shadow-sm transition-colors hover:border-primary/50"
                >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-foreground group-hover:text-primary">{title}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">{desc}</span>
                    </span>
                </Link>
            ))}
        </div>
    );
}

// ===================== 最近动态 =====================

export interface TimelineItem {
    key: string;
    kind: "post" | "essay";
    date: string;
    title: string;
    excerpt: string;
    href: string;
}

export function AboutTimeline({ items }: { items: TimelineItem[] }) {
    if (items.length === 0) return null;
    return (
        <ol className="relative ml-1 space-y-3 border-l border-border pl-4">
            {items.map((item) => (
                <li key={item.key} className="relative">
                    <span
                        className={`absolute -left-[1.32rem] top-1.5 size-2 rounded-full ring-2 ring-background ${
                            item.kind === "post" ? "bg-primary" : "bg-amber-500"
                        }`}
                        aria-hidden
                    />
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="tabular-nums">{item.date}</span>
                        <span
                            className={`rounded px-1.5 py-0.5 ${
                                item.kind === "post" ? "bg-primary/10 text-primary" : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                            }`}
                        >
                            {item.kind === "post" ? "文章" : "说说"}
                        </span>
                    </div>
                    <Link
                        href={item.href}
                        className="mt-0.5 block truncate text-sm font-medium text-foreground transition-colors hover:text-primary"
                    >
                        {item.title}
                    </Link>
                    {item.excerpt && (
                        <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{item.excerpt}</p>
                    )}
                </li>
            ))}
        </ol>
    );
}

// ===================== 装备缩略 =====================

export interface EquipmentMiniItem {
    name: string;
    description: string;
    image?: string;
}

export function AboutEquipmentMini({ items, groupTitle }: { items: EquipmentMiniItem[]; groupTitle?: string }) {
    if (items.length === 0) return null;
    return (
        <div className="space-y-3">
            {groupTitle && <p className="text-xs text-muted-foreground">{groupTitle}</p>}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {items.map((item) => (
                    <div key={item.name} className="flex items-center gap-2 rounded-xl border bg-card p-3 shadow-sm">
                        {item.image ? (
                            // eslint-disable-next-line @next/next/no-img-element -- 装备图来自后端静态目录/外链
                            <img src={item.image} alt="" className="size-8 shrink-0 rounded-md object-cover" />
                        ) : (
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                                <Wrench className="size-3.5" />
                            </span>
                        )}
                        <span className="min-w-0">
                            <span className="block truncate text-xs font-medium text-foreground">{item.name}</span>
                            <span className="block truncate text-[11px] text-muted-foreground">{item.description}</span>
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}
