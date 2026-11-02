"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import {
    CircleX,
    Download,
    MessagesSquare,
    RefreshCw,
    Reply,
    RotateCcw,
    Search,
    Ticket,
    Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/confirm-provider";
import { Input } from "@/components/ui/input";
import { PaginationControls } from "@/components/pagination-controls";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { ACTION_TONE } from "@/lib/action-tones";
import { cn } from "@/lib/utils";
import {
    closeAdminTicketApi,
    deleteAdminTicketApi,
    getAdminTicketApi,
    getAdminTicketStatsApi,
    getAdminTicketsApi,
    replyAdminTicketApi,
    updateAdminTicketStatusApi,
    type Ticket as TicketItem,
    type TicketDetail,
    type TicketMessage,
    type TicketStatsData,
    type TicketStatus,
} from "@/lib/api-membership";

/**
 * 售后工单 —— 已接真接口（PRO 模块）。
 *
 * 远端接口（权威来源：官方前端快照 scripts/theme/theme-anheyu-next-main/src/lib/api/support.ts）：
 *   GET    /pro/admin/support/tickets              L20-22  工单列表（page / page_size / status / type / keyword）
 *   GET    /pro/admin/support/tickets/{id}         L27-29  工单详情（含 messages）
 *   POST   /pro/admin/support/tickets/{id}/reply   L34-36  管理员回复（body { content }）
 *   POST   /pro/admin/support/tickets/{id}/close   L41-43  关闭工单（**无 body**）
 *   PUT    /pro/admin/support/tickets/{id}/status  L48-50  改状态（body { status }）
 *   DELETE /pro/admin/support/tickets/{id}         L55-57  删除工单
 *   GET    /pro/admin/support/tickets/stats        L62-63  统计（pending / processing / closed / total）
 *
 * 浏览器端不直连后端（无 CORS + 需鉴权），全部经同源代理 /api/admin/support/* 转发
 * （见 src/app/api/admin/support/）。写操作（回复 / 关闭 / 改状态 / 删除）都要二次确认，
 * 本轮**未对线上实测过任何写接口**。
 *
 * ⚠️ 两套状态口径（官方类型 support.ts L5 vs L55-60）：
 *    工单状态 Ticket.status = OPEN | REPLIED | CLOSED（列表/详情/改状态用）
 *    统计口径 TicketStatsResponse = pending | processing | closed | total
 *    官方前端没给映射关系，所以这里把两组数字**分开显示**（磁贴走统计接口、行内走 status 枚举），
 *    不做「pending = OPEN」这类猜测。
 *
 * ⚠️ type 的枚举官方没给（support.ts L19 就是 string），所以类型下拉**从当前加载到的数据里推导**，
 *    不硬编一组可能不对的值去筛后端。
 */

const PAGE_SIZE = 10;

/** 工单状态（官方 support.ts: TicketStatus） */
const STATUS_OPTIONS: { value: TicketStatus; label: string }[] = [
    { value: "OPEN", label: "待处理" },
    { value: "REPLIED", label: "已回复" },
    { value: "CLOSED", label: "已关闭" },
];

const STATUS_META: Record<TicketStatus, { label: string; cls: string }> = {
    OPEN: { label: "待处理", cls: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400" },
    REPLIED: { label: "已回复", cls: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400" },
    CLOSED: { label: "已关闭", cls: "bg-muted text-muted-foreground" },
};

/** 状态徽章（未知值原样显示，不吞掉后端的新枚举） */
function statusBadge(status?: string) {
    const meta = status ? STATUS_META[status as TicketStatus] : undefined;
    return meta ?? { label: status || "—", cls: "bg-muted text-muted-foreground" };
}

const SENDER_META: Record<TicketMessage["sender_type"], { label: string; cls: string }> = {
    USER: { label: "用户", cls: "bg-muted text-muted-foreground" },
    ADMIN: { label: "客服", cls: "bg-primary/10 text-primary" },
};

/** 统计磁贴（官方 support.ts: TicketStatsResponse 的四个字段名） */
const STAT_TILES = [
    { key: "pending", label: "待处理", dot: "bg-amber-500", cls: "text-amber-600 dark:text-amber-400" },
    { key: "processing", label: "处理中", dot: "bg-sky-500", cls: "text-sky-600 dark:text-sky-400" },
    { key: "closed", label: "已关闭", dot: "bg-slate-400", cls: "text-muted-foreground" },
    { key: "total", label: "总计", dot: "bg-primary", cls: "text-primary" },
] as const;

/** 时间戳（YYYY-MM-DD HH:MM，本地时区；数据是拉取后渲染的，不涉及水合一致性） */
function formatDateTime(iso?: string | null): string {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 弹窗里的「标签 + 值」小格 */
function Meta({ label, value }: { label: string; value: ReactNode }) {
    return (
        <div className="min-w-0">
            <p className="text-muted-foreground">{label}</p>
            <p className="mt-0.5 truncate text-foreground">{value}</p>
        </div>
    );
}

const EMPTY_STATS: TicketStatsData = { pending: 0, processing: 0, closed: 0, total: 0 };

/** CSV 单元格转义（值里可能带逗号/引号/换行） */
function csvCell(value: unknown): string {
    const s = value === undefined || value === null ? "" : String(value);
    return `"${s.replace(/"/g, '""')}"`;
}

/**
 * 售后工单页：统计磁贴 + 筛选工具栏 + 表格（卡片内滚动、表头吸顶）+ 分页 + 会话详情弹窗。
 * 与打赏管理页同一套 admin 列表外壳约定，数据全部来自远端 PRO 接口。
 */
export function SupportsManager() {
    // ===== 筛选（status / keyword 直接作为远端查询参数；type 从已加载数据里推导） =====
    const [statusFilter, setStatusFilter] = useState("");
    const [typeFilter, setTypeFilter] = useState("");
    const [keyword, setKeyword] = useState("");
    const [debouncedKeyword, setDebouncedKeyword] = useState("");

    // ===== 列表 / 分页（服务端分页） =====
    const [tickets, setTickets] = useState<TicketItem[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [refreshKey, setRefreshKey] = useState(0);

    // ===== 统计（独立接口） =====
    const [stats, setStats] = useState<TicketStatsData>(EMPTY_STATS);
    const [statsOk, setStatsOk] = useState(false);

    // ===== 详情弹窗 =====
    const [detail, setDetail] = useState<TicketDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [replyContent, setReplyContent] = useState("");
    const [replying, setReplying] = useState(false);
    const [acting, setActing] = useState(false);

    // 应用内确认弹窗（替代 window.confirm，见 components/confirm-provider.tsx）
    const confirm = useConfirm();

    // 搜索防抖：每敲一个字就请求一次会把后端打爆（官方前端也是 useDebouncedValue 350ms）。
    // 页码由输入框自己重置（见下面 onChange），这里只负责把关键词延后生效，避免重复请求。
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedKeyword(keyword), 350);
        return () => clearTimeout(timer);
    }, [keyword]);

    // 拉取工单列表（浏览器自动携带登录 cookie，代理再补 Bearer）
    useEffect(() => {
        let cancelled = false;
        const timer = setTimeout(() => setLoading(true), 0);
        getAdminTicketsApi({
            page,
            page_size: PAGE_SIZE,
            status: statusFilter || undefined,
            type: typeFilter || undefined,
            keyword: debouncedKeyword.trim() || undefined,
        })
            .then((data) => {
                if (cancelled) return;
                setTickets(data.list);
                setTotal(data.total);
            })
            .catch((e) => {
                if (!cancelled) toast.error(e instanceof Error ? e.message : "工单列表加载失败");
            })
            .finally(() => {
                if (!cancelled) {
                    clearTimeout(timer);
                    setLoading(false);
                }
            });
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [page, statusFilter, typeFilter, debouncedKeyword, refreshKey]);

    // 拉取统计：失败不阻塞列表（磁贴退回 0 并置灰），与官方「统计失败不阻塞页面」一致
    useEffect(() => {
        let cancelled = false;
        getAdminTicketStatsApi()
            .then((data) => {
                if (cancelled) return;
                setStats({
                    pending: Number(data?.pending ?? 0),
                    processing: Number(data?.processing ?? 0),
                    closed: Number(data?.closed ?? 0),
                    total: Number(data?.total ?? 0),
                });
                setStatsOk(true);
            })
            .catch(() => {
                if (!cancelled) {
                    setStats(EMPTY_STATS);
                    setStatsOk(false);
                }
            });
        return () => {
            cancelled = true;
        };
    }, [refreshKey]);

    /** 统一的「刷新列表 + 统计」 */
    const refresh = () => setRefreshKey((k) => k + 1);

    /** 重新拉当前打开的详情（写操作后保持会话内容最新） */
    const reloadDetail = async (id: string) => {
        const fresh = await getAdminTicketApi(id);
        setDetail(fresh);
        return fresh;
    };

    const handleOpenDetail = async (item: TicketItem) => {
        setDetailLoading(true);
        // 先占位，让弹窗立刻出现并显示加载态（详情接口再补 messages）
        setDetail({ ...item, messages: [] });
        setReplyContent("");
        try {
            await reloadDetail(item.id);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "工单详情加载失败");
            setDetail(null);
        } finally {
            setDetailLoading(false);
        }
    };

    const handleReply = async () => {
        if (!detail) return;
        const content = replyContent.trim();
        if (!content) {
            toast.warning("请输入回复内容");
            return;
        }
        if (
            !(await confirm({
                title: `确定向工单「${detail.ticket_no}」发送这条回复吗？`,
                description: "发送后用户可见，不可撤回。",
            }))
        )
            return;
        setReplying(true);
        try {
            await replyAdminTicketApi(detail.id, content);
            toast.success("回复已发送");
            setReplyContent("");
            await reloadDetail(detail.id);
            refresh();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "回复失败");
        } finally {
            setReplying(false);
        }
    };

    const handleCloseTicket = async (item: TicketItem) => {
        if (
            !(await confirm({
                title: `确定关闭工单「${item.ticket_no}」吗？`,
                description: "关闭后用户无法继续在该工单里回复。",
            }))
        )
            return;
        setActing(true);
        try {
            await closeAdminTicketApi(item.id);
            toast.success("工单已关闭");
            if (detail?.id === item.id) await reloadDetail(item.id);
            refresh();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "关闭工单失败");
        } finally {
            setActing(false);
        }
    };

    const handleChangeStatus = async (item: TicketItem, next: TicketStatus) => {
        if (next === item.status) return;
        // 后端将来新增枚举值时兜底：不认识的状态不编标签，原样回显
        const label = STATUS_META[next]?.label ?? String(next);
        if (!(await confirm({ title: `确定把工单「${item.ticket_no}」的状态改成「${label}」吗？` }))) return;
        setActing(true);
        try {
            await updateAdminTicketStatusApi(item.id, next);
            toast.success(`工单状态已改为「${label}」`);
            // 就地更新行，避免整表闪烁；统计与详情仍以服务端为准
            setTickets((prev) => prev.map((t) => (t.id === item.id ? { ...t, status: next } : t)));
            if (detail?.id === item.id) await reloadDetail(item.id);
            refresh();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "更新工单状态失败");
        } finally {
            setActing(false);
        }
    };

    const handleDeleteTicket = async (item: TicketItem) => {
        if (
            !(await confirm({
                title: `确定删除工单「${item.ticket_no}」吗？`,
                description: "工单与其全部会话记录都会被删除，且不可恢复。",
                danger: true,
            }))
        )
            return;
        setActing(true);
        try {
            await deleteAdminTicketApi(item.id);
            toast.success("工单已删除");
            if (detail?.id === item.id) setDetail(null);
            // 删掉当前页最后一条且后面没有内容时回退一页，避免停在空页
            if (tickets.length === 1 && page > 1) setPage((p) => p - 1);
            else refresh();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "删除工单失败");
        } finally {
            setActing(false);
        }
    };

    /** 重置筛选（清空后由防抖 effect 自动重拉第一页） */
    const resetFilters = () => {
        setStatusFilter("");
        setTypeFilter("");
        setKeyword("");
        setDebouncedKeyword("");
        setPage(1);
    };

    /** 导出当前页为 CSV（纯前端生成：不新增依赖，也不给后端加未验证的导出端点） */
    const handleExport = () => {
        if (tickets.length === 0) {
            toast.info("当前页没有可导出的工单");
            return;
        }
        const header = ["工单号", "主题", "用户邮箱", "类型", "状态", "消息数", "最后回复", "交易号", "创建时间"];
        const rows = tickets.map((t) =>
            [
                t.ticket_no,
                t.subject,
                t.user_email,
                t.type,
                t.status,
                t.message_count ?? 0,
                formatDateTime(t.last_reply_at),
                t.trade_no,
                formatDateTime(t.created_at),
            ]
                .map(csvCell)
                .join(",")
        );
        const csv = `\uFEFF${[header.map(csvCell).join(","), ...rows].join("\r\n")}`;
        // 用 Blob + 临时 <a download>：纯前端导出，不加依赖；BOM 让 Excel 正确识别 UTF-8 中文
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `tickets-page${page}-${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(url);
        toast.success("已导出当前页工单");
    };

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    // 类型下拉：只列当前加载到的 type（官方没给枚举，不猜取值去筛后端）
    const typeOptions = Array.from(new Set(tickets.map((t) => t.type).filter((v): v is string => !!v))).sort();

    // 任何宽度都用同一套列模板：窄屏靠 .admin-scroll 横向滚动、操作列 sticky 固定，不再折成卡片。
    // 窄屏也保持 min-w：整张表横向滚动，列不会被压扁。
    // 列宽按「390px 屏上还能看见标题」反推：工单号 88 + 标题保底 180，操作列 104（窄屏「会话」只留图标，
    // 三个图标按钮 ≈ 92px）。原来 112 + 188 的组合会让固定列吃掉大半屏，标题基本看不见。
    const rowGrid = "grid-cols-[88px_minmax(180px,1fr)_160px_76px_84px_72px_124px_128px_104px]";
    const rowMinW = "min-w-[1200px]";

    return (
        // admin-card：吃掉剩余高度，列表区域（admin-scroll）在卡片内部滚动，不再顶高整页
        <div className="admin-card">
            {/* 统计磁贴：口径照 TicketStatsResponse（pending / processing / closed / total），
                接口失败时显示 0 并置灰（不阻塞列表）。固定在卡片顶部，不随列表滚动 */}
            <div className="grid shrink-0 grid-cols-2 gap-2 border-b p-3 md:grid-cols-4">
                {STAT_TILES.map((tile) => (
                    <div key={tile.key} className="rounded-lg border bg-muted/40 px-3 py-2">
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span className={`size-1.5 rounded-full ${tile.dot}`} aria-hidden />
                            {tile.label}
                        </p>
                        <p className={cn("mt-0.5 text-lg font-semibold tabular-nums", statsOk ? tile.cls : "text-muted-foreground/50")}>
                            {stats[tile.key]}
                        </p>
                    </div>
                ))}
            </div>

            {/* 工具栏：固定在卡片顶部（shrink-0），不随下方列表滚动 */}
            <div className="flex shrink-0 flex-col gap-2 border-b bg-muted/40 px-4 py-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                    <div className="relative w-full sm:w-56">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={keyword}
                            onChange={(e) => {
                                setKeyword(e.target.value);
                                setPage(1);
                            }}
                            placeholder="搜索工单号 / 主题 / 用户邮箱"
                            className="h-8 w-full pl-8 text-xs sm:w-56"
                            aria-label="搜索工单"
                        />
                    </div>

                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        状态
                        <Select
                            value={statusFilter || "all"}
                            onValueChange={(v) => {
                                setStatusFilter(v === "all" ? "" : v);
                                setPage(1);
                            }}
                        >
                            <SelectTrigger className="h-8 w-full min-w-0 text-xs sm:w-max">
                                <SelectValue placeholder="全部" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">全部</SelectItem>
                                {STATUS_OPTIONS.map((o) => (
                                    <SelectItem key={o.value} value={o.value}>
                                        {o.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        类型
                        <Select
                            value={typeFilter || "all"}
                            onValueChange={(v) => {
                                setTypeFilter(v === "all" ? "" : v);
                                setPage(1);
                            }}
                            disabled={typeOptions.length === 0}
                        >
                            <SelectTrigger className="h-8 w-full min-w-0 text-xs sm:w-max">
                                <SelectValue placeholder={typeOptions.length === 0 ? "暂无可选类型" : "全部"} />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">全部</SelectItem>
                                {typeOptions.map((t) => (
                                    <SelectItem key={t} value={t}>
                                        {t}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <Button variant="outline" size="sm" className="h-8 shrink-0" onClick={resetFilters}>
                        <RotateCcw className="size-3.5" />
                        <span className="hidden sm:inline">重置</span>
                    </Button>

                    <span className="text-xs text-muted-foreground">
                        共 <span className="font-medium text-foreground">{total}</span> 条工单
                    </span>
                </div>

                <div className="flex w-full items-center gap-2 sm:w-auto">
                    <Button variant="outline" size="sm" className="h-8 shrink-0" onClick={handleExport}>
                        <Download className="size-3.5" />
                        <span className="hidden sm:inline">导出本页</span>
                    </Button>
                    <Button variant="outline" size="sm" className="h-8 shrink-0" onClick={refresh} disabled={loading}>
                        <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
                        <span className="hidden sm:inline">刷新</span>
                    </Button>
                </div>
            </div>

            {/* 列表：卡片内唯一滚动区（表头吸顶），工具栏与分页都不动 */}
            <div className="admin-scroll">
                <div
                    className={`admin-sticky-head admin-list-head items-center gap-3 border-b px-4 py-2 text-xs font-medium text-muted-foreground grid ${rowMinW} ${rowGrid}`}
                >
                    <span>工单号</span>
                    <span>主题</span>
                    <span>用户</span>
                    <span>类型</span>
                    <span className="text-center">状态</span>
                    <span className="text-center">消息数</span>
                    <span>最后回复</span>
                    <span>关联交易号</span>
                    <span className="text-right">操作</span>
                </div>

                {loading ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">加载中…</div>
                ) : tickets.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center">
                        <span className="flex size-11 items-center justify-center rounded-full border bg-muted/60 text-muted-foreground">
                            <Ticket className="size-5" />
                        </span>
                        <p className="text-sm font-medium text-foreground">
                            {statusFilter || typeFilter || keyword ? "没有匹配的工单" : "暂无工单"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                            {statusFilter || typeFilter || keyword ? "换个筛选条件试试" : "用户提交售后工单后会出现在这里"}
                        </p>
                    </div>
                ) : (
                    tickets.map((item) => {
                        const badge = statusBadge(item.status);
                        return (
                            <div
                                key={item.id}
                                className={`grid admin-list-row items-center gap-x-3 gap-y-2 border-b px-4 py-3 text-sm transition-colors last:border-b-0 hover:bg-muted/40 sm:gap-y-1 ${rowMinW} ${rowGrid}`}
                            >
                                <div className="font-mono text-xs text-muted-foreground">
                                    {item.ticket_no || "—"}
                                </div>
                                <div className="min-w-0">
                                    <div className="flex items-start gap-2">
                                        <Ticket className="mt-0.5 size-4 shrink-0 text-muted-foreground/60" />
                                        <span className="line-clamp-1 font-medium text-foreground">
                                            {item.subject || "—"}
                                        </span>
                                    </div>
                                </div>
                                <div className="truncate text-xs text-muted-foreground">
                                    {item.user_email || "—"}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                    {item.type || "—"}
                                </div>
                                <div className="sm:text-center">
                                    {/* 状态既是展示也是操作：直接改成 OPEN / REPLIED / CLOSED（改状态走 PUT，带二次确认） */}
                                    <Select
                                        value={item.status}
                                        onValueChange={(v) => handleChangeStatus(item, v as TicketStatus)}
                                        disabled={acting}
                                    >
                                        <SelectTrigger
                                            className={cn(
                                                "mx-auto h-6 w-max gap-1 rounded-full border-0 px-2 text-xs font-medium",
                                                badge.cls
                                            )}
                                            aria-label="修改工单状态"
                                        >
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {STATUS_OPTIONS.map((o) => (
                                                <SelectItem key={o.value} value={o.value}>
                                                    {o.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="text-xs tabular-nums text-muted-foreground sm:text-center">
                                    {/* 裸数字脱离表头看不懂，窄屏补个前缀 */}
                                    {item.message_count ?? 0}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                    {formatDateTime(item.last_reply_at)}
                                </div>
                                <div className="truncate font-mono text-xs text-muted-foreground">
                                    {item.trade_no || "—"}
                                </div>
                                <div className="flex items-center gap-1 sm:justify-end">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        aria-label="查看会话"
                                        title="查看会话"
                                        className={ACTION_TONE.view}
                                        onClick={() => handleOpenDetail(item)}
                                    >
                                        <MessagesSquare className="size-4" />
                                        <span className="hidden sm:inline">会话</span>
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        aria-label="关闭工单"
                                        title="关闭工单"
                                        disabled={acting || item.status === "CLOSED"}
                                        className={ACTION_TONE.neutral}
                                        onClick={() => handleCloseTicket(item)}
                                    >
                                        <CircleX className="size-4" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        aria-label="删除工单"
                                        title="删除工单"
                                        disabled={acting}
                                        className={ACTION_TONE.delete}
                                        onClick={() => handleDeleteTicket(item)}
                                    >
                                        <Trash2 className="size-4" />
                                    </Button>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* 分页：固定在卡片底部，不随列表滚动 */}
            <div className="flex shrink-0 items-center justify-between gap-3 border-t bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
                <span>
                    第 {page} / {totalPages} 页
                </span>
                <PaginationControls page={page} totalPages={totalPages} onPageChange={setPage} disabled={loading} />
            </div>

            {/* ===== 会话详情弹窗：详情接口拉全量 messages，可直接回复 / 关闭 / 删除 ===== */}
            {detail && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
                    onMouseDown={() => setDetail(null)}
                >
                    <div
                        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border bg-card p-4 shadow-xl"
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        <div className="mb-3 flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <h3 className="truncate text-base font-semibold">{detail.subject || "工单会话"}</h3>
                                    <span
                                        className={`inline-block shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge(detail.status).cls}`}
                                    >
                                        {statusBadge(detail.status).label}
                                    </span>
                                </div>
                                <p className="mt-1 font-mono text-xs text-muted-foreground">
                                    工单号 {detail.ticket_no || "—"}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setDetail(null)}
                                aria-label="关闭"
                                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="grid shrink-0 grid-cols-2 gap-x-3 gap-y-2 text-xs sm:grid-cols-3">
                            <Meta label="用户邮箱" value={detail.user_email || "—"} />
                            <Meta label="用户 ID" value={detail.user_id ?? "—"} />
                            <Meta label="类型" value={detail.type || "—"} />
                            <Meta label="消息数" value={detail.message_count ?? (detail.messages?.length ?? 0)} />
                            <Meta label="最后回复" value={formatDateTime(detail.last_reply_at)} />
                            <Meta label="关联交易号" value={detail.trade_no || "—"} />
                            <Meta label="关联订单" value={detail.order_id ?? "—"} />
                            <Meta label="创建时间" value={formatDateTime(detail.created_at)} />
                            <Meta label="更新时间" value={formatDateTime(detail.updated_at)} />
                        </div>

                        {/* 会话消息：来自详情接口的 messages */}
                        <div className="mt-3 min-h-32 flex-1 overflow-auto rounded-lg border bg-muted/30 p-3">
                            {detailLoading ? (
                                <p className="py-6 text-center text-xs text-muted-foreground">加载会话记录…</p>
                            ) : (detail.messages?.length ?? 0) === 0 ? (
                                <p className="py-6 text-center text-xs text-muted-foreground">暂无会话消息</p>
                            ) : (
                                detail.messages.map((m) => {
                                    const sender = SENDER_META[m.sender_type] ?? {
                                        label: m.sender_type || "未知",
                                        cls: "bg-muted text-muted-foreground",
                                    };
                                    return (
                                        <div
                                            key={m.id}
                                            className={`mb-2 rounded-lg border bg-card px-3 py-2 text-xs last:mb-0 ${
                                                m.sender_type === "ADMIN" ? "ml-6" : "mr-6"
                                            }`}
                                        >
                                            <div className="mb-1 flex items-center justify-between gap-2">
                                                <span
                                                    className={`rounded-full px-1.5 py-px text-[11px] font-medium ${sender.cls}`}
                                                >
                                                    {sender.label}
                                                </span>
                                                <span className="text-muted-foreground">
                                                    {formatDateTime(m.created_at)}
                                                </span>
                                            </div>
                                            <p className="whitespace-pre-wrap break-words text-foreground">
                                                {m.content}
                                            </p>
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        {/* 回复区：仅在工单未关闭时给输入框（官方 TicketDetailDrawer.tsx L119 同款约定） */}
                        {detail.status !== "CLOSED" ? (
                            <div className="mt-3 shrink-0">
                                <textarea
                                    value={replyContent}
                                    onChange={(e) => setReplyContent(e.target.value)}
                                    placeholder="请输入回复内容…"
                                    rows={3}
                                    disabled={replying}
                                    className="w-full rounded-lg border bg-background px-3 py-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60 dark:bg-input/30"
                                />
                            </div>
                        ) : (
                            <p className="mt-3 shrink-0 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                                该工单已关闭，如需继续沟通请让用户重新创建工单。
                            </p>
                        )}

                        <div className="mt-3 flex shrink-0 flex-wrap justify-end gap-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                className={ACTION_TONE.delete}
                                disabled={acting}
                                onClick={() => handleDeleteTicket(detail)}
                            >
                                <Trash2 className="size-3.5" />
                                删除工单
                            </Button>
                            <div className="flex-1" />
                            <Button variant="outline" onClick={() => setDetail(null)}>
                                关闭窗口
                            </Button>
                            <Button
                                variant="outline"
                                disabled={acting || detail.status === "CLOSED"}
                                onClick={() => handleCloseTicket(detail)}
                            >
                                <CircleX className="size-3.5" />
                                关闭工单
                            </Button>
                            <Button onClick={handleReply} disabled={replying || detail.status === "CLOSED"}>
                                <Reply className="size-3.5" />
                                {replying ? "发送中…" : "发送回复"}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
