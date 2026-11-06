"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, MessageSquare } from "lucide-react";
import { toast } from "sonner";

import { PendingLinksCard } from "@/components/admin/pending-links-card";
import { getAdminCommentsApi } from "@/lib/api";
import type { AdminComment } from "@/types/comments";

/* =============================================================================
 * 仪表盘「动态」区块：左边「最新评论」+ 右边「待审友链」（见 pending-links-card.tsx）
 *
 * ⚠️ 这里只剩一张评论卡：原来的「待审评论」卡按需求换成了「待审友链」，评论的通过 / 驳回
 *    一键操作随之从仪表盘移除（审核仍只在评论管理页做，仪表盘不再发任何写请求）。
 *
 * 接口契约（源码证据）：
 *  - GET /api/admin/comments → 远端 GET /comments（internal/infra/router/router.go:279-281，
 *    JWTAuth + AdminAuth）→ pkg/handler/comment/handler.go:406-420 AdminList
 *    → pkg/service/comment/service.go:1164-1199：分页 page/pageSize，status 为可选筛选。
 *    仓库实现 internal/infra/persistence/ent/comment_repo.go:246-308：
 *    **不传 status 时不过滤状态**（返回全部），传 status 时按状态精确过滤；
 *    排序为「置顶在前 → created_at DESC」，所以 page=1 就是最新若干条。
 *
 * 布局：`grid grid-cols-1 lg:grid-cols-2 gap-3 items-stretch` —— 窄屏上下堆叠、宽屏左右并排
 *    （左＝最新评论、右＝待审友链），顺序天然是「左→右、上→下」，不使用 CSS 多列。
 *    `items-stretch` + 内容区 `overflow-y-auto` 让两卡**视觉等高**，超出部分卡内滚动（不裁内容）。
 *    两张卡外观与统计区的卡片一致（同一个 cardCls：底色 / 描边 / 圆角 / 阴影 + 图标徽章卡头）。
 * ========================================================================== */

/** 最新评论拉取条数（展示只取前 RECENT_SHOWN 条） */
const RECENT_LIMIT = 6;
/** 最新评论展示条数（只显示前 3 条） */
const RECENT_SHOWN = 3;

/**
 * 卡片外壳：与统计区卡片完全一致的令牌（`rounded-xl border bg-card p-4 shadow-sm`，
 * 深色模式由 bg-card 自身随主题切换），不额外发明一套底色；`flex flex-col` 便于卡内滚动。
 */
const cardCls = "flex flex-col rounded-xl border bg-card p-4 shadow-sm";

/** 卡内容区：撑满剩余高度、超出卡内滚动（不裁掉任何一条） */
const cardBodyCls = "min-h-0 flex-1 overflow-y-auto";

/** 卡头图标徽章（与统计卡 GroupTitle 同款：主色 10% 底 + 主色图标） */
const iconBadgeCls = "flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary";

/** 左右两卡容器：1 列 → lg 两列并排；items-stretch 让两卡等高 */
/** 状态徽章（1=已发布 2=待审核，配色与评论管理页一致） */
function statusBadge(status?: number) {
    if (status === 1) return { label: "已发布", cls: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400" };
    if (status === 2) return { label: "待审核", cls: "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-400" };
    return { label: "未知", cls: "bg-muted text-muted-foreground" };
}

/** 评论正文压成一行（列表里预览、判长度、悬浮预览都用它） */
function oneLine(text?: string): string {
    return (text ?? "").replace(/\s+/g, " ").trim();
}

/** 相对时间（刚刚 / N 分钟前 / N 小时前 / N 天前 / YYYY-MM-DD） */
function formatRelative(iso?: string): string {
    if (!iso) return "—";
    const t = new Date(iso).getTime();
    if (Number.isNaN(t)) return "—";
    const diffMin = Math.floor((Date.now() - t) / 60000);
    if (diffMin < 1) return "刚刚";
    if (diffMin < 60) return `${diffMin} 分钟前`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour} 小时前`;
    const diffDay = Math.floor(diffHour / 24);
    if (diffDay < 30) return `${diffDay} 天前`;
    const d = new Date(t);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * 「按长度排」：按正文（压成一行后）字符数**升序**排列。
 * 只改渲染顺序，不动接口返回的集合（信息一条不少，长文本仍可悬浮 / 点进详情看全文）。
 * 短卡在前、长卡在后，两张卡里各行高度都差不多，视觉上不会一高一低。
 */
function sortByLengthAsc(list: AdminComment[]): AdminComment[] {
    return [...list].sort((a, b) => oneLine(a.content).length - oneLine(b.content).length);
}

/** 卡头：图标徽章 + 标题 + 右侧入口链接（与统计卡 GroupTitle 同一套写法） */
function CardHeader({
    icon,
    title,
    href,
    linkText,
}: {
    icon: React.ReactNode;
    title: string;
    href: string;
    linkText: string;
}) {
    return (
        <div className="mb-3 flex items-center gap-2">
            <span className={iconBadgeCls}>{icon}</span>
            <h3 className="text-sm font-semibold">{title}</h3>
            <Link
                href={href}
                className="ml-auto inline-flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
                {linkText}
                <ChevronRight className="size-3.5" />
            </Link>
        </div>
    );
}

/** 评论行：作者 + 状态 + 时间 / 正文（最多 2 行，悬浮看全文）/ 来源页
 *  行与行之间的分隔线由父级 `<ul className="divide-y ...">` 提供 */
function CommentRow({ comment }: { comment: AdminComment }) {
    const badge = statusBadge(comment.status);
    const text = oneLine(comment.content);
    return (
        <li className="py-2.5 first:pt-0 last:pb-0">
            <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                        {/* 昵称可截断（min-w-0），状态徽章与时间不许被挤走 */}
                        <span className="min-w-0 truncate text-xs font-medium" title={comment.nickname || "匿名"}>
                            {comment.nickname || "匿名"}
                        </span>
                        <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-medium ${badge.cls}`}>{badge.label}</span>
                        <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{formatRelative(comment.created_at)}</span>
                    </div>
                    {/* line-clamp-2：长文本压到 2 行（悬浮 title 看全文），行高一致、两卡更齐整 */}
                    <p className="mt-1 line-clamp-2 text-xs leading-snug break-words text-muted-foreground" title={text}>
                        {text || "—"}
                    </p>
                    {comment.target_path && (
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground/70" title={comment.target_path}>
                            {comment.target_title || comment.target_path}
                        </p>
                    )}
                </div>
            </div>
        </li>
    );
}

/** 加载骨架：一张大卡占位（与真实布局同样的「卡内两栏」结构） */
function Skeleton() {
    return (
        <div
            className="grid grid-cols-1 gap-0 divide-y divide-border/60 rounded-lg border bg-card lg:grid-cols-[minmax(0,1fr)_20rem] lg:divide-x lg:divide-y-0"
            aria-busy="true"
            aria-label="动态加载中"
        >
            {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="h-[248px] animate-pulse" />
            ))}
        </div>
    );
}

/**
 * 动态区块：左卡「最新评论」（全部状态，带状态标签），右卡「待审友链」（独立组件，只读）。
 * 两张卡各自拉自己的接口，互不阻塞（一边失败不影响另一边渲染）。
 */
export function CommentFeed() {
    const [recent, setRecent] = useState<AdminComment[]>([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            // 不传 status：后端不过滤状态，返回「置顶在前 + 最新」的列表
            const data = await getAdminCommentsApi({ page: 1, pageSize: RECENT_LIMIT });
            setRecent(data.list ?? []);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "获取最近评论失败");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        // 延后到下一个 tick：effect 内同步 setState 会触发级联渲染（react-hooks/set-state-in-effect）
        const timer = setTimeout(() => void load(), 0);
        return () => clearTimeout(timer);
    }, [load]);

    if (loading) {
        return <Skeleton />;
    }

    // 按正文长度升序排，取前 3 条（短卡在前，行高相近）
    const recentShown = sortByLengthAsc(recent).slice(0, RECENT_SHOWN);

    return (
        // 动态 = 一张大卡：内部左右两栏（左「最新评论」、右「待审友链」），中间一条竖线分隔。
        // 原来是两张独立卡并肩放，右边只有 1 条数据时会被拉成和左边一样高、下方一大片空白。
        <section className={`${cardCls} p-0`}>
            <div className="grid flex-1 grid-cols-1 divide-y divide-border/60 lg:grid-cols-[minmax(0,1fr)_20rem] lg:divide-x lg:divide-y-0">
                {/* ===== 左：最新评论（前 3 条，条目间横线分隔） ===== */}
                <div className="flex min-h-0 flex-col p-4">
                    <CardHeader
                        icon={<MessageSquare className="size-3.5" />}
                        title="最新评论"
                        href="/admin/comments"
                        linkText="全部评论"
                    />
                    <div className={cardBodyCls}>
                        {recentShown.length === 0 ? (
                            <p className="py-8 text-center text-xs text-muted-foreground">暂无评论</p>
                        ) : (
                            // divide-y：相邻条目之间一条横杠，把每条评论区分开（不再是一整块文字）
                            <ul className="divide-y divide-border/60">
                                {recentShown.map((c) => (
                                    <CommentRow key={c.id} comment={c} />
                                ))}
                            </ul>
                        )}
                    </div>
                </div>

                {/* ===== 右：待审友链（全部 status=PENDING，卡内滚动） ===== */}
                <div className="flex min-h-0 flex-col p-4">
                    <PendingLinksCard embedded />
                </div>
            </div>
        </section>
    );
}
