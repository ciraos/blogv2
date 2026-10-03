"use client";

import { useState } from "react";
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
} from "lucide-react";

import { Button } from "@/components/ui/button";
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

/**
 * 售后工单（静态外壳 / 后端接口未接入）
 *
 * 接口现状（2026-02 探活）：
 *   对 /pro/admin/{supports, tickets, after-sales, aftersales, service, work-orders, feedback,
 *   support-tickets} 共 8 个候选路径做过线上探活，**全部 404**；同一环境下
 *   /pro/admin/donations、/pro/admin/orders 都返回 401（= 路径存在、只是未登录）。
 *   所以后端目前没有可用的工单接口，本页**不发任何网络请求**：
 *     · 统计磁贴数值一律显示「—」；
 *     · 列表恒为空态（图标 + 暂无工单 + 接口接入后显示）；
 *     · 分页保持禁用；
 *     · 所有动作按钮只弹 toast 提示「…待接入」。
 *
 * 字段来源：暂按官方前端类型定义 support.ts 书写 ——
 *   Ticket / TicketMessage / TicketStatsResponse，等接口确认后按真实返回再校准。
 *   注意：Ticket.status 的枚举是 OPEN|REPLIED|CLOSED，而统计口径是
 *   pending|processing|closed，两套命名的映射关系同样待接口确认。
 */

/** 工单状态（来自 support.ts 的 Ticket.status） */
type TicketStatus = "OPEN" | "REPLIED" | "CLOSED";

/** 工单（support.ts: Ticket） */
interface Ticket {
    ticket_no: string;
    subject: string;
    type: string;
    status: TicketStatus;
    user_email: string;
    trade_no?: string;
    order_id?: string;
    message_count?: number;
    last_reply_at?: string | null;
    created_at?: string;
}

/** 工单会话消息（support.ts: TicketMessage） */
interface TicketMessage {
    content: string;
    sender_type: "USER" | "ADMIN";
    created_at: string;
}

/** 统计口径（support.ts: TicketStatsResponse）：pending / processing / closed / total */
const STAT_TILES = [
    { key: "pending", label: "待处理", dot: "bg-amber-500" },
    { key: "processing", label: "处理中", dot: "bg-sky-500" },
    { key: "closed", label: "已关闭", dot: "bg-slate-400" },
    { key: "total", label: "总计", dot: "bg-primary" },
] as const;

/** 状态筛选项（Ticket.status；中文文案与统计磁贴口径对齐，映射待接口确认） */
const STATUS_OPTIONS: { value: TicketStatus; label: string }[] = [
    { value: "OPEN", label: "待处理" },
    { value: "REPLIED", label: "已回复" },
    { value: "CLOSED", label: "已关闭" },
];

/** 类型筛选项：Ticket.type 是字符串，后端枚举未确认，先给一组占位取值 */
const TYPE_OPTIONS = [
    { value: "order", label: "订单问题" },
    { value: "refund", label: "退款售后" },
    { value: "trade", label: "交易异常" },
    { value: "other", label: "其它" },
];

const STATUS_META: Record<TicketStatus, { label: string; cls: string }> = {
    OPEN: { label: "待处理", cls: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400" },
    REPLIED: { label: "已回复", cls: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400" },
    CLOSED: { label: "已关闭", cls: "bg-muted text-muted-foreground" },
};

/** 状态徽章 */
function statusBadge(status: TicketStatus) {
    return STATUS_META[status] ?? { label: String(status), cls: "bg-muted text-muted-foreground" };
}

const SENDER_META: Record<TicketMessage["sender_type"], { label: string; cls: string }> = {
    USER: { label: "用户", cls: "bg-muted text-muted-foreground" },
    ADMIN: { label: "管理员", cls: "bg-primary/10 text-primary" },
};

/** 时间戳（YYYY-MM-DD HH:MM，本地时区） */
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

/** 接口未接入时的数值占位 */
const PLACEHOLDER = "—";

const PAGE_SIZE = 10;

/**
 * 售后工单页外壳：统计磁贴 + 筛选工具栏 + 表格（卡片内滚动、表头吸顶）+ 分页 + 会话详情弹窗。
 * 与打赏管理页同一套 admin 列表外壳约定，但**不接任何接口**：筛选用本地 state，动作按钮只弹 toast。
 */
export function SupportsManager() {
    // ===== 筛选（纯本地 state，接口接入后作为请求参数） =====
    const [statusFilter, setStatusFilter] = useState("");
    const [typeFilter, setTypeFilter] = useState("");
    const [keyword, setKeyword] = useState("");

    // ===== 列表 / 分页（接口未接入：恒定空列表 + 禁用分页） =====
    // 接上后端后，把 tickets 换成 GET 接口返回的 list、total 换成返回值即可复用下面整套渲染。
    const [tickets] = useState<Ticket[]>([]);
    const [page, setPage] = useState(1);
    const total = 0;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    // ===== 会话详情弹窗（占位：消息结构按 TicketMessage，接口接入后填充） =====
    const [active, setActive] = useState<Ticket | null>(null);
    const [messages] = useState<TicketMessage[]>([]);

    /** 重置筛选（只清本地 state，不发请求） */
    const resetFilters = () => {
        setStatusFilter("");
        setTypeFilter("");
        setKeyword("");
        setPage(1);
    };

    // 移动端(<640px)：grid-cols-1 把每个单元格竖排成卡片；≥640px：恢复表格式列布局。
    // min-w 只写在 sm: 以上 —— 窄屏若也撑宽，卡片就会被拉出横向滚动。
    const rowGrid =
        "sm:grid-cols-[112px_minmax(0,1fr)_168px_80px_76px_64px_136px_132px_176px]";
    const rowMinW = "sm:min-w-[1160px]";

    return (
        // admin-card：吃掉剩余高度，列表区域（admin-scroll）在卡片内部滚动，不再顶高整页
        <div className="admin-card">
            {/* 统计磁贴：口径照 TicketStatsResponse（pending / processing / closed / total）。
                接口未接入，数值一律占位「—」；固定在卡片顶部（shrink-0），不随列表滚动 */}
            <div className="grid shrink-0 grid-cols-2 gap-2 border-b p-3 md:grid-cols-4">
                {STAT_TILES.map((tile) => (
                    <div key={tile.key} className="rounded-lg border bg-muted/40 px-3 py-2">
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span className={`size-1.5 rounded-full ${tile.dot}`} aria-hidden />
                            {tile.label}
                        </p>
                        <p className="mt-0.5 text-lg font-semibold tabular-nums text-muted-foreground">
                            {PLACEHOLDER}
                        </p>
                    </div>
                ))}
            </div>

            {/* 工具栏：固定在卡片顶部（shrink-0），不随下方列表滚动。
                工具栏 / 表头 / 数据行共用同一套响应式规则：<640px 竖排成卡片，≥640px 表格式布局 */}
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b bg-muted/40 px-4 py-2.5">
                {/* 左：关键词 + 状态 + 类型 + 重置（全部本地 state，不发请求） */}
                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative w-56">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={keyword}
                            onChange={(e) => setKeyword(e.target.value)}
                            placeholder="搜索工单号 / 主题 / 用户邮箱"
                            className="h-8 pl-8 text-xs"
                            aria-label="搜索工单"
                        />
                    </div>

                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        状态
                        <Select
                            value={statusFilter || "all"}
                            onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}
                        >
                            <SelectTrigger className="h-7 w-max text-xs">
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
                            onValueChange={(v) => setTypeFilter(v === "all" ? "" : v)}
                        >
                            <SelectTrigger className="h-7 w-max text-xs">
                                <SelectValue placeholder="全部" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">全部</SelectItem>
                                {TYPE_OPTIONS.map((o) => (
                                    <SelectItem key={o.value} value={o.value}>
                                        {o.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <Button variant="outline" size="sm" className="h-8" onClick={resetFilters}>
                        <RotateCcw className="size-3.5" />
                        重置
                    </Button>

                    <span className="text-xs text-muted-foreground">
                        共 <span className="font-medium text-foreground">{PLACEHOLDER}</span> 条工单
                    </span>
                </div>

                {/* 右：动作按钮一律占位 —— 接口未接入，点了只弹提示 */}
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() => toast.info("导出功能待接入")}
                    >
                        <Download className="size-3.5" />
                        导出
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() => toast.info("刷新功能待接入")}
                    >
                        <RefreshCw className="size-3.5" />
                        刷新
                    </Button>
                </div>
            </div>

            {/* 列表：卡片内唯一滚动区（表头吸顶），工具栏与分页都不动 */}
            <div className="admin-scroll">
                {/* 表头：移动端隐藏（卡片自带行内信息即可读懂），≥sm 才以 grid 显示 */}
                <div
                    className={`admin-sticky-head hidden items-center gap-3 border-b px-4 py-2.5 text-xs font-medium text-muted-foreground sm:grid ${rowMinW} ${rowGrid}`}
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

                {tickets.length === 0 ? (
                    // 体面空态：接口未接入，列表恒为空
                    <div className="flex flex-col items-center justify-center gap-2 px-4 py-16 text-center">
                        <span className="flex size-11 items-center justify-center rounded-full border bg-muted/60 text-muted-foreground">
                            <Ticket className="size-5" />
                        </span>
                        <p className="text-sm font-medium text-foreground">暂无工单</p>
                        <p className="text-xs text-muted-foreground">接口接入后显示</p>
                    </div>
                ) : (
                    tickets.map((item) => {
                        const badge = statusBadge(item.status);
                        return (
                            <div
                                key={item.ticket_no}
                                className={`grid grid-cols-1 items-center gap-x-3 gap-y-2 border-b px-4 py-3 text-sm transition-colors last:border-b-0 hover:bg-muted/40 sm:gap-y-1 ${rowMinW} ${rowGrid}`}
                            >
                                <div className="font-mono text-xs text-muted-foreground">
                                    <span className="mr-1 font-sans sm:hidden">工单号</span>
                                    {item.ticket_no || PLACEHOLDER}
                                </div>
                                <div className="min-w-0">
                                    <div className="flex items-start gap-2">
                                        <Ticket className="mt-0.5 size-4 shrink-0 text-muted-foreground/60" />
                                        <span className="line-clamp-1 font-medium text-foreground">
                                            {item.subject || PLACEHOLDER}
                                        </span>
                                    </div>
                                </div>
                                <div className="truncate text-xs text-muted-foreground">
                                    <span className="mr-1 sm:hidden">用户</span>
                                    {item.user_email || PLACEHOLDER}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                    <span className="mr-1 sm:hidden">类型</span>
                                    {item.type || PLACEHOLDER}
                                </div>
                                <div className="sm:text-center">
                                    <span
                                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}
                                    >
                                        {badge.label}
                                    </span>
                                </div>
                                <div className="text-xs tabular-nums text-muted-foreground sm:text-center">
                                    {/* 裸数字脱离表头看不懂，窄屏补个前缀 */}
                                    <span className="mr-1 sm:hidden">消息</span>
                                    {item.message_count ?? 0}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                    <span className="mr-1 sm:hidden">最后回复</span>
                                    {formatDateTime(item.last_reply_at)}
                                </div>
                                <div className="truncate font-mono text-xs text-muted-foreground">
                                    <span className="mr-1 font-sans sm:hidden">交易号</span>
                                    {item.trade_no || PLACEHOLDER}
                                </div>
                                <div className="flex items-center gap-1 sm:justify-end">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        aria-label="查看会话"
                                        title="查看会话"
                                        className={ACTION_TONE.view}
                                        onClick={() => setActive(item)}
                                    >
                                        <MessagesSquare className="size-4" />
                                        查看会话
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        aria-label="回复"
                                        title="回复"
                                        className={ACTION_TONE.edit}
                                        onClick={() => toast.info("回复功能待接入")}
                                    >
                                        <Reply className="size-4" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        aria-label="关闭工单"
                                        title="关闭工单"
                                        className={ACTION_TONE.neutral}
                                        onClick={() => toast.info("关闭工单功能待接入")}
                                    >
                                        <CircleX className="size-4" />
                                    </Button>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* 分页：固定在卡片底部，不随列表滚动；接口未接入 → 恒为第 1/1 页且整体禁用 */}
            <div className="flex shrink-0 items-center justify-between gap-3 border-t bg-muted/40 px-4 py-2.5 text-xs text-muted-foreground">
                <span>
                    第 {page} / {totalPages} 页
                </span>
                <PaginationControls page={page} totalPages={totalPages} onPageChange={setPage} disabled />
            </div>

            {/* ===== 会话详情弹窗（占位：消息结构照 TicketMessage，接口接入后按 sender_type 渲染） ===== */}
            {active && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
                    onMouseDown={() => setActive(null)}
                >
                    <div
                        className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-xl border bg-card p-5 shadow-xl"
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        <div className="mb-4 flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <h3 className="truncate text-base font-semibold">
                                    {active.subject || "工单会话"}
                                </h3>
                                <p className="mt-1 font-mono text-xs text-muted-foreground">
                                    工单号 {active.ticket_no || PLACEHOLDER}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setActive(null)}
                                aria-label="关闭"
                                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="grid shrink-0 grid-cols-2 gap-x-3 gap-y-2 text-xs sm:grid-cols-3">
                            <Meta label="用户邮箱" value={active.user_email || PLACEHOLDER} />
                            <Meta label="类型" value={active.type || PLACEHOLDER} />
                            <Meta
                                label="状态"
                                value={
                                    <span
                                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge(active.status).cls}`}
                                    >
                                        {statusBadge(active.status).label}
                                    </span>
                                }
                            />
                            <Meta label="消息数" value={active.message_count ?? 0} />
                            <Meta label="最后回复" value={formatDateTime(active.last_reply_at)} />
                            <Meta label="关联交易号" value={active.trade_no || PLACEHOLDER} />
                            <Meta label="关联订单" value={active.order_id || PLACEHOLDER} />
                            <Meta label="创建时间" value={formatDateTime(active.created_at)} />
                        </div>

                        {/* 会话消息：接口接入后由详情接口填充 */}
                        <div className="mt-4 min-h-24 flex-1 overflow-auto rounded-lg border bg-muted/30 p-3">
                            {messages.length === 0 ? (
                                <p className="py-6 text-center text-xs text-muted-foreground">
                                    暂无会话消息（接口接入后显示）
                                </p>
                            ) : (
                                messages.map((m, i) => (
                                    <div
                                        key={i}
                                        className={`mb-2 rounded-lg border bg-card px-3 py-2 text-xs last:mb-0 ${
                                            m.sender_type === "ADMIN" ? "ml-6" : "mr-6"
                                        }`}
                                    >
                                        <div className="mb-1 flex items-center justify-between gap-2">
                                            <span
                                                className={`rounded-full px-1.5 py-px text-[11px] font-medium ${SENDER_META[m.sender_type].cls}`}
                                            >
                                                {SENDER_META[m.sender_type].label}
                                            </span>
                                            <span className="text-muted-foreground">
                                                {formatDateTime(m.created_at)}
                                            </span>
                                        </div>
                                        <p className="whitespace-pre-wrap break-words text-foreground">
                                            {m.content}
                                        </p>
                                    </div>
                                ))
                            )}
                        </div>

                        <div className="mt-4 flex shrink-0 justify-end gap-2">
                            <Button variant="outline" onClick={() => setActive(null)}>
                                关闭窗口
                            </Button>
                            <Button
                                variant="outline"
                                onClick={() => toast.info("回复功能待接入")}
                            >
                                <Reply className="size-3.5" />
                                回复
                            </Button>
                            <Button onClick={() => toast.info("关闭工单功能待接入")}>
                                <CircleX className="size-3.5" />
                                关闭工单
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
