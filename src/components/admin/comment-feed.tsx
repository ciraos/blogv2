"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, ChevronRight, Loader2, MessageSquare, ShieldAlert, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { getAdminCommentsApi, updateAdminCommentStatusApi } from "@/lib/api";
import type { AdminComment } from "@/types/comments";

/* =============================================================================
 * 仪表盘「评论动态」：左边「最新评论」+ 右边「待审评论」（一键通过 / 驳回）
 *
 * 接口契约（源码证据）：
 *  - GET /api/admin/comments → 远端 GET /comments（internal/infra/router/router.go:279-281，
 *    JWTAuth + AdminAuth）→ pkg/handler/comment/handler.go:406-420 AdminList
 *    → pkg/service/comment/service.go:1164-1199：分页 page/pageSize，status 为可选筛选。
 *    仓库实现 internal/infra/persistence/ent/comment_repo.go:246-308：
 *    **不传 status 时不过滤状态**（返回全部），传 status 时按状态精确过滤；
 *    排序为「置顶在前 → created_at DESC」，所以 page=1 就是最新若干条。
 *  - PUT /api/admin/comments/{id}/status → 远端 PUT /comments/{id}/status（router.go:285）
 *    → handler.go:208-232 UpdateStatus，请求体 { status: 1 | 2 }
 *    （pkg/handler/comment/dto/dto.go:67-69，binding:"required,oneof=1 2"）。
 *
 * ⚠️ 写操作声明：通过 / 驳回都会改评论状态（1=已发布，2=待审核），
 *    按任务约定**只实现不实测**（不向线上发写请求），每次点击都先走二次确认。
 *
 * 布局：`grid grid-cols-1 lg:grid-cols-2 gap-3 items-stretch` —— 窄屏上下堆叠、宽屏左右并排
 *    （左＝最新评论、右＝待审评论），顺序天然是「左→右、上→下」，不使用 CSS 多列。
 *    `items-stretch` + 内容区 `overflow-y-auto` 让两卡**视觉等高**，超出部分卡内滚动（不裁内容）。
 *    两张卡外观与统计区的卡片一致（同一个 cardCls：底色 / 描边 / 圆角 / 阴影 + 图标徽章卡头）。
 * ========================================================================== */

/** 最新评论拉取条数（展示只取前 RECENT_SHOWN 条） */
const RECENT_LIMIT = 6;
/** 最新评论展示条数（只显示前 3 条） */
const RECENT_SHOWN = 3;
/** 待审评论展示条数（同时作为待审卡的行数上限） */
const PENDING_LIMIT = 5;
/** 待审评论卡最多渲染几条（压矮整块：卡片窄、行数少，避免一高一低） */
const PENDING_SHOWN = 3;

/**
 * 卡片外壳：与统计区卡片完全一致的令牌（`rounded-xl border bg-card p-4 shadow-sm`，
 * 深色模式由 bg-card 自身随主题切换），不额外发明一套底色；`flex flex-col` 便于卡内滚动。
 */
const cardCls = "flex flex-col rounded-xl border bg-card p-4 shadow-sm";

/** 两卡统一的最小高度：等高、不留大片空白，内容多了卡内滚动 */
const cardMinH = "min-h-[248px]";

/** 卡内容区：撑满剩余高度、超出卡内滚动（不裁掉任何一条） */
const cardBodyCls = "min-h-0 flex-1 overflow-y-auto";

/** 卡头图标徽章（与统计卡 GroupTitle 同款：主色 10% 底 + 主色图标） */
const iconBadgeCls = "flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary";

/** 左右两卡容器：1 列 → lg 两列并排；items-stretch 让两卡等高 */
const feedCls = "grid grid-cols-1 items-stretch gap-3 lg:grid-cols-2";

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

/** 卡头：图标徽章 + 标题 +（可选）计数徽标 + 右侧入口链接（与统计卡 GroupTitle 同一套写法） */
function CardHeader({
    icon,
    title,
    count,
    countCls,
    href,
    linkText,
}: {
    icon: React.ReactNode;
    title: string;
    count?: number;
    countCls?: string;
    href: string;
    linkText: string;
}) {
    return (
        <div className="mb-3 flex items-center gap-2">
            <span className={iconBadgeCls}>{icon}</span>
            <h3 className="text-sm font-semibold">{title}</h3>
            {count !== undefined && count > 0 && (
                <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-medium ${countCls ?? "bg-muted text-muted-foreground"}`}>
                    {count}
                </span>
            )}
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

/** 评论行：作者 + 状态 + 时间 / 正文（最多 2 行，悬浮看全文）/ 来源页 /（待审时）通过·驳回
 *  行与行之间的分隔线由父级 `<ul className="divide-y ...">` 提供 */
function CommentRow({
    comment,
    pending,
    busyId,
    onApprove,
    onReject,
}: {
    comment: AdminComment;
    pending: boolean;
    busyId: string | null;
    onApprove?: (comment: AdminComment) => void;
    onReject?: (comment: AdminComment) => void;
}) {
    const badge = statusBadge(comment.status);
    const busy = busyId === comment.id;
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
                {pending && (
                    // 行内按钮 h-8；靠右不换行，保证整卡高度恒定
                    <div className="flex shrink-0 items-center gap-1.5">
                        <Button
                            size="sm"
                            className="h-8 rounded-lg px-2 text-xs"
                            disabled={busy}
                            title="通过审核并发布"
                            onClick={() => onApprove?.(comment)}
                        >
                            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                            通过
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8 rounded-lg px-2 text-xs text-destructive hover:text-destructive"
                            disabled={busy}
                            title="驳回（后端只有 1=已发布 / 2=待审核 两种状态，驳回即维持待审核）"
                            onClick={() => onReject?.(comment)}
                        >
                            <X className="size-3.5" />
                            驳回
                        </Button>
                    </div>
                )}
            </div>
        </li>
    );
}

/** 加载骨架：左右两张等高卡占位（与真实布局同样的列规则） */
function Skeleton() {
    return (
        <div className={feedCls} aria-busy="true" aria-label="评论动态加载中">
            {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="h-[248px] animate-pulse rounded-xl border bg-card" />
            ))}
        </div>
    );
}

/**
 * 评论动态：左卡「最新评论」（全部状态，带状态标签），右卡「待审评论」（一键通过 / 驳回）。
 * 两个接口并行拉取；审核成功后本地先移除该条并重新拉取，保证徽章计数与列表一致。
 */
export function CommentFeed() {
    const [recent, setRecent] = useState<AdminComment[]>([]);
    const [pending, setPending] = useState<AdminComment[]>([]);
    const [pendingTotal, setPendingTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        const [recentRes, pendingRes] = await Promise.allSettled([
            // 不传 status：后端不过滤状态，返回「置顶在前 + 最新」的列表
            getAdminCommentsApi({ page: 1, pageSize: RECENT_LIMIT }),
            // status=2：只看待审核
            getAdminCommentsApi({ page: 1, pageSize: PENDING_LIMIT, status: 2 }),
        ]);

        if (recentRes.status === "fulfilled") {
            setRecent(recentRes.value.list ?? []);
        } else {
            toast.error(recentRes.reason instanceof Error ? recentRes.reason.message : "获取最近评论失败");
        }

        if (pendingRes.status === "fulfilled") {
            setPending(pendingRes.value.list ?? []);
            setPendingTotal(pendingRes.value.total ?? 0);
        } else {
            toast.error(pendingRes.reason instanceof Error ? pendingRes.reason.message : "获取待审评论失败");
        }

        setLoading(false);
    }, []);

    useEffect(() => {
        // 延后到下一个 tick：effect 内同步 setState 会触发级联渲染（react-hooks/set-state-in-effect）
        const timer = setTimeout(() => void load(), 0);
        return () => clearTimeout(timer);
    }, [load]);

    /** 审核（通过=1 / 驳回=2）；⚠️ 写操作，仅实现不实测，提交前二次确认 */
    const moderate = async (comment: AdminComment, status: 1 | 2) => {
        const preview = oneLine(comment.content).slice(0, 40) || "（无正文）";
        const isApprove = status === 1;
        const hint = isApprove
            ? "通过后这条评论会立即在前台评论区显示。"
            : "驳回后这条评论仍保持「待审核」，只有管理员能在后台看到。";
        const ok = window.confirm(
            `确定${isApprove ? "通过" : "驳回"}这条评论吗？\n\n` + `${comment.nickname || "匿名"}：${preview}\n\n` + hint
        );
        if (!ok) return;

        setBusyId(comment.id);
        try {
            await updateAdminCommentStatusApi(comment.id, status);
            toast.success(isApprove ? "已通过审核" : "已驳回（保持待审核）");
            await load();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "操作失败");
        } finally {
            setBusyId(null);
        }
    };

    if (loading) {
        return <Skeleton />;
    }

    // 两卡都按正文长度升序排；各取前 N 条（最新 3 条 / 待审 3 条），保证两卡高度相近
    const recentShown = sortByLengthAsc(recent).slice(0, RECENT_SHOWN);
    const pendingShown = sortByLengthAsc(pending).slice(0, PENDING_SHOWN);

    return (
        <div className={feedCls}>
            {/* ===== 左：最新评论（前 3 条，条目间横线分隔） ===== */}
            <section className={`${cardCls} ${cardMinH}`}>
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
                                <CommentRow key={c.id} comment={c} pending={false} busyId={busyId} />
                            ))}
                        </ul>
                    )}
                </div>
            </section>

            {/* ===== 右：待审评论（最多 3 条，压矮整块，与左卡等高） ===== */}
            <section className={`${cardCls} ${cardMinH}`}>
                <CardHeader
                    icon={<ShieldAlert className="size-3.5" />}
                    title="待审评论"
                    count={pendingTotal}
                    countCls="bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-400"
                    href="/admin/comments"
                    linkText="去评论管理"
                />
                <div className={cardBodyCls}>
                    {pendingShown.length === 0 ? (
                        <p className="py-8 text-center text-xs text-muted-foreground">没有待审核的评论 🎉</p>
                    ) : (
                        <ul className="divide-y divide-border/60">
                            {pendingShown.map((c) => (
                                <CommentRow
                                    key={c.id}
                                    comment={c}
                                    pending
                                    busyId={busyId}
                                    onApprove={(comment) => void moderate(comment, 1)}
                                    onReject={(comment) => void moderate(comment, 2)}
                                />
                            ))}
                        </ul>
                    )}
                </div>
                {pendingTotal > pendingShown.length && (
                    <Link
                        href="/admin/comments"
                        className="mt-2 flex shrink-0 items-center justify-center gap-0.5 border-t border-border/60 pt-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                    >
                        查看全部 {pendingTotal} 条待审评论
                        <ChevronRight className="size-3.5" />
                    </Link>
                )}
            </section>
        </div>
    );
}
