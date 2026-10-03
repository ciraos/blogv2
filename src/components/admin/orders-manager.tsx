"use client";

import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { toast } from "sonner";
import {
    Banknote,
    CalendarPlus,
    CircleX,
    Clock,
    Download,
    Eye,
    Loader2,
    RefreshCw,
    RotateCcw,
    Search,
    ShoppingCart,
    TriangleAlert,
    Undo2,
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
import { getAdminOrdersApi } from "@/lib/api";
import type {
    AdminOrder,
    AdminOrderListParams,
    OrderStatus,
    OrderType,
    PaymentProvider,
} from "@/types/orders";

/**
 * 订单管理页：统计磁贴 + 筛选工具栏 + 列表（卡片内滚动、表头吸顶）+ 分页。
 *
 * 接口：远端 PRO 模块 `/pro/admin/orders` → 同源代理 `/api/admin/orders`
 *   （浏览器带登录 cookie 走同源，见 src/app/api/admin/orders/route.ts）。
 *   ⚠️ 响应分页字段是 `size`（不是 `page_size`）；请求参数里分页字段才叫 `page_size`。
 *   参数：page / page_size / status / payment_provider / order_type / order_no /
 *        trade_no / user_email / start_date / end_date …
 *   类型定义统一放在 `@/types/orders`（本组件不再内联重复类型）。
 *
 * 本次范围（只做「读」）：
 *   ✅ 首屏加载 + 筛选（查询 / 回车 / 下拉变更）+ 分页切换；loading / 空态 / 错误态齐全；
 *   ⛔ 行内操作（详情 / 关闭 / 退款）与工具栏「刷新 / 导出」仍是占位 toast；
 *   ⛔ 统计磁贴没有独立接口，数值一律显示「—」。
 *
 * 布局与 globals.css 的 .admin-* 约定一致：卡片直系 flex 子元素里只有 .admin-scroll 一个滚动区。
 */

const PAGE_SIZE = 20;

/** 订单状态（OrderStatus）→ 中文徽章 */
const STATUS_META: Record<OrderStatus, { label: string; cls: string }> = {
    PENDING: { label: "待支付", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
    SUCCESS: { label: "已支付", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
    FAILED: { label: "支付失败", cls: "bg-red-500/15 text-red-600 dark:text-red-400" },
    CANCELLED: { label: "已取消", cls: "bg-slate-500/15 text-slate-600 dark:text-slate-300" },
    EXPIRED: { label: "已过期", cls: "bg-muted text-muted-foreground" },
};

/** 支付方式（payment_provider）→ 中文 */
const PROVIDER_LABEL: Record<PaymentProvider, string> = {
    ALIPAY: "支付宝",
    WECHAT: "微信支付",
    EPAY: "易支付",
    HUPIJIAO: "虎皮椒",
};

/** 订单类型（order_type）→ 中文 */
const ORDER_TYPE_LABEL: Record<OrderType, string> = {
    ARTICLE: "文章",
    SHARE: "分享",
    PRODUCT: "商品",
    MEMBERSHIP: "会员",
};

/** 筛选项：状态 / 支付方式 / 订单类型（枚举值来自 @/types/orders，展示用中文） */
const STATUS_OPTIONS = (Object.keys(STATUS_META) as OrderStatus[]).map((value) => ({
    value,
    label: STATUS_META[value].label,
}));
const PROVIDER_OPTIONS = (Object.keys(PROVIDER_LABEL) as PaymentProvider[]).map((value) => ({
    value,
    label: PROVIDER_LABEL[value],
}));
const ORDER_TYPE_OPTIONS = (Object.keys(ORDER_TYPE_LABEL) as OrderType[]).map((value) => ({
    value,
    label: ORDER_TYPE_LABEL[value],
}));

/** 统计磁贴（本次没有对应接口，数值统一显示 —） */
const STAT_TILES = [
    { label: "订单总数", icon: ShoppingCart, tone: "text-foreground" },
    { label: "已支付金额", icon: Banknote, tone: "text-primary" },
    { label: "待支付", icon: Clock, tone: "text-amber-600 dark:text-amber-400" },
    { label: "今日新增", icon: CalendarPlus, tone: "text-emerald-600 dark:text-emerald-400" },
] as const;

/** 筛选控件状态：全部以字符串保存（"" = 未选择） */
interface FilterState {
    orderNo: string;
    tradeNo: string;
    userEmail: string;
    status: string;
    provider: string;
    orderType: string;
    startDate: string;
    endDate: string;
}

const EMPTY_FILTERS: FilterState = {
    orderNo: "",
    tradeNo: "",
    userEmail: "",
    status: "",
    provider: "",
    orderType: "",
    startDate: "",
    endDate: "",
};

/** 筛选条件 → 接口参数：空串一律转 undefined（后端不接受空字符串） */
function buildParams(f: FilterState, page: number, pageSize: number): AdminOrderListParams {
    return {
        page,
        page_size: pageSize,
        status: (f.status || undefined) as OrderStatus | undefined,
        payment_provider: (f.provider || undefined) as PaymentProvider | undefined,
        order_type: (f.orderType || undefined) as OrderType | undefined,
        order_no: f.orderNo.trim() || undefined,
        trade_no: f.tradeNo.trim() || undefined,
        user_email: f.userEmail.trim() || undefined,
        start_date: f.startDate || undefined,
        end_date: f.endDate || undefined,
    };
}

/** 是否有生效中的筛选（决定空态文案：没匹配 vs 确实没数据） */
function hasAnyFilter(f: FilterState): boolean {
    return Boolean(
        f.orderNo.trim() ||
            f.tradeNo.trim() ||
            f.userEmail.trim() ||
            f.status ||
            f.provider ||
            f.orderType ||
            f.startDate ||
            f.endDate
    );
}

/** 时间戳（YYYY-MM-DD HH:MM，本地时区） */
function formatDateTime(iso?: string): string {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 金额展示（两位小数） */
function money(value: unknown): string {
    const n = Number(value);
    return Number.isFinite(n) ? n.toFixed(2) : "—";
}

/** 状态徽章（未知值原样兜底，避免后端口径变化时白屏） */
function statusBadge(status: string) {
    return STATUS_META[status as OrderStatus] ?? { label: status || "—", cls: "bg-muted text-muted-foreground" };
}

/** 支付方式 / 订单类型：未知值原样兜底 */
function providerLabel(provider: string) {
    return PROVIDER_LABEL[provider as PaymentProvider] ?? (provider || "—");
}

function orderTypeLabel(type: string) {
    return ORDER_TYPE_LABEL[type as OrderType] ?? (type || "—");
}

export function OrdersManager() {
    // ===== 筛选条件 =====
    // draft：输入框里正在编辑的值；applied：真正发给接口的值。
    // 文本框/日期 → 点「查询」或回车才提交；下拉框 → 变更即提交（都会回到第 1 页）。
    const [draft, setDraft] = useState<FilterState>(EMPTY_FILTERS);
    const [applied, setApplied] = useState<FilterState>(EMPTY_FILTERS);

    // ===== 列表数据（全部来自 /api/admin/orders）=====
    const [orders, setOrders] = useState<AdminOrder[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize] = useState(PAGE_SIZE);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    /** 非筛选类重拉（错误态重试）；变更即触发 effect */
    const [reloadKey, setReloadKey] = useState(0);

    /** 请求序号：只认最后一次请求的结果，避免快速切筛选/翻页时旧响应覆盖新数据 */
    const reqSeq = useRef(0);

    useEffect(() => {
        const seq = ++reqSeq.current;
        // 延后到下一个 tick：effect 内同步 setState 会触发级联渲染（react-hooks/set-state-in-effect）
        const timer = setTimeout(async () => {
            setLoading(true);
            setError(null);
            try {
                const data = await getAdminOrdersApi(buildParams(applied, page, pageSize));
                if (seq !== reqSeq.current) return;
                setOrders(data.orders ?? []);
                setTotal(data.total ?? 0);
            } catch (e) {
                if (seq !== reqSeq.current) return;
                const message = e instanceof Error ? e.message : "订单列表加载失败";
                setOrders([]);
                setTotal(0);
                setError(message);
                toast.error(message);
            } finally {
                if (seq === reqSeq.current) setLoading(false);
            }
        }, 0);
        return () => {
            clearTimeout(timer);
            // 卸载 / 参数变化：作废在途请求的结果
            reqSeq.current += 1;
        };
    }, [applied, page, pageSize, reloadKey]);

    /** 提交一组筛选值：进第 1 页并重新请求（即使条件没变也重拉，作为「查询」的语义） */
    const search = (next: FilterState) => {
        setDraft(next);
        setApplied(next);
        setPage(1);
        setReloadKey((k) => k + 1);
    };

    /** 下拉变更：立即生效（左侧输入框保持用户正在编辑的内容） */
    const commit = (patch: Partial<FilterState>) => {
        search({ ...draft, ...patch });
    };

    /** 「查询」按钮 / 输入框回车：把 draft 提交出去 */
    const runQuery = () => search({ ...draft });

    const handleEnter = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") runQuery();
    };

    const resetFilters = () => search({ ...EMPTY_FILTERS });

    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    const changePage = (next: number) => {
        const target = Math.min(Math.max(1, next), totalPages);
        if (target === page) return;
        setPage(target);
    };

    const retry = () => setReloadKey((k) => k + 1);

    // 移动端(<640px)：grid-cols-1 把每个单元格竖排成卡片；≥640px：恢复表格式列布局。
    // min-w 只写在 sm: 以上 —— 窄屏若也撑宽，卡片就会被拉出横向滚动。
    const rowGrid = "sm:grid-cols-[minmax(0,1fr)_84px_150px_92px_92px_84px_128px_128px_120px]";
    const rowMinW = "sm:min-w-[1060px]";

    return (
        // admin-card：吃掉剩余高度，列表区域（admin-scroll）在卡片内部滚动，不再顶高整页
        <div className="admin-card">
            {/* 统计磁贴：固定在卡片顶部（shrink-0），不随列表滚动 */}
            <div className="grid shrink-0 grid-cols-2 gap-2 border-b p-3 md:grid-cols-4">
                {STAT_TILES.map((tile) => (
                    <div key={tile.label} className="rounded-lg border bg-muted/40 px-3 py-2">
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <tile.icon className="size-3.5 text-muted-foreground/70" />
                            {tile.label}
                        </p>
                        <p className={`mt-0.5 text-lg font-semibold tabular-nums ${tile.tone}`}>—</p>
                    </div>
                ))}
            </div>

            {/* 工具栏：固定在卡片顶部（shrink-0），不随下方列表滚动。
                筛选条件与列表列共用同一套响应式规则：<640px 竖排成卡片，≥640px 表格式布局 */}
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b p-3">
                {/* 左：筛选条件 + 查询 / 重置 */}
                <div className="flex flex-1 flex-wrap items-center gap-2">
                    {/* order_no */}
                    <Input
                        value={draft.orderNo}
                        onChange={(e) => setDraft((prev) => ({ ...prev, orderNo: e.target.value }))}
                        onKeyDown={handleEnter}
                        placeholder="订单号"
                        aria-label="按订单号筛选"
                        className="h-8 w-36 text-sm"
                    />
                    {/* trade_no */}
                    <Input
                        value={draft.tradeNo}
                        onChange={(e) => setDraft((prev) => ({ ...prev, tradeNo: e.target.value }))}
                        onKeyDown={handleEnter}
                        placeholder="交易号"
                        aria-label="按交易号筛选"
                        className="h-8 w-36 text-sm"
                    />
                    {/* user_email */}
                    <Input
                        value={draft.userEmail}
                        onChange={(e) => setDraft((prev) => ({ ...prev, userEmail: e.target.value }))}
                        onKeyDown={handleEnter}
                        placeholder="用户邮箱"
                        aria-label="按用户邮箱筛选"
                        className="h-8 w-44 text-sm"
                    />

                    {/* payment_status（下拉变更立即查询） */}
                    <Select value={draft.status} onValueChange={(v) => commit({ status: v })}>
                        <SelectTrigger className="h-8 w-28 shrink-0" aria-label="按订单状态筛选">
                            <SelectValue placeholder="订单状态" />
                        </SelectTrigger>
                        <SelectContent>
                            {STATUS_OPTIONS.map((o) => (
                                <SelectItem key={o.value} value={o.value}>
                                    {o.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    {/* payment_provider */}
                    <Select value={draft.provider} onValueChange={(v) => commit({ provider: v })}>
                        <SelectTrigger className="h-8 w-28 shrink-0" aria-label="按支付方式筛选">
                            <SelectValue placeholder="支付方式" />
                        </SelectTrigger>
                        <SelectContent>
                            {PROVIDER_OPTIONS.map((o) => (
                                <SelectItem key={o.value} value={o.value}>
                                    {o.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    {/* order_type */}
                    <Select value={draft.orderType} onValueChange={(v) => commit({ orderType: v })}>
                        <SelectTrigger className="h-8 w-26 shrink-0" aria-label="按订单类型筛选">
                            <SelectValue placeholder="订单类型" />
                        </SelectTrigger>
                        <SelectContent>
                            {ORDER_TYPE_OPTIONS.map((o) => (
                                <SelectItem key={o.value} value={o.value}>
                                    {o.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    {/* start_date / end_date：日期范围（回车提交） */}
                    <div className="flex items-center gap-1.5">
                        <Input
                            type="date"
                            value={draft.startDate}
                            onChange={(e) => setDraft((prev) => ({ ...prev, startDate: e.target.value }))}
                            onKeyDown={handleEnter}
                            aria-label="开始日期"
                            className="h-8 w-36 text-sm"
                        />
                        <span className="text-xs text-muted-foreground">至</span>
                        <Input
                            type="date"
                            value={draft.endDate}
                            onChange={(e) => setDraft((prev) => ({ ...prev, endDate: e.target.value }))}
                            onKeyDown={handleEnter}
                            aria-label="结束日期"
                            className="h-8 w-36 text-sm"
                        />
                    </div>

                    <Button variant="outline" size="sm" className="h-8" onClick={runQuery}>
                        <Search size={14} />
                        查询
                    </Button>
                    <Button variant="outline" size="sm" className="h-8" onClick={resetFilters}>
                        <RotateCcw size={14} />
                        重置
                    </Button>
                </div>

                {/* 右：刷新 / 导出（仍为占位，本次只做「读」） */}
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() => toast.info("订单刷新待接入")}
                    >
                        <RefreshCw size={14} />
                        刷新
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() => toast.info("订单导出待接入")}
                    >
                        <Download size={14} />
                        导出
                    </Button>
                </div>
            </div>

            {/* 列表：卡片内唯一滚动区（表头吸顶），统计磁贴 / 工具栏 / 分页都不动。
                三种状态都渲染在这一个 .admin-scroll 里，外壳结构保持不变。 */}
            <div className="admin-scroll">
                {/* 表头：移动端隐藏（卡片自带行内信息即可读懂），≥sm 才以 grid 显示 */}
                <div className={`admin-sticky-head hidden items-center gap-3 border-b px-4 py-2.5 text-xs font-medium text-muted-foreground sm:grid ${rowMinW} ${rowGrid}`}>
                    <span>订单号 / 交易号</span>
                    <span>类型</span>
                    <span>用户</span>
                    <span>金额</span>
                    <span>支付方式</span>
                    <span className="text-center">状态</span>
                    <span>支付时间</span>
                    <span>创建时间</span>
                    <span className="text-right">操作</span>
                </div>

                {loading ? (
                    // 加载态：只在表格区给骨架 + spinner，不整页白屏
                    <div className="flex flex-col items-center justify-center gap-3 px-4 py-16 text-center">
                        <Loader2 className="size-5 animate-spin text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">加载中…</p>
                        <div className="w-full max-w-3xl space-y-2" aria-hidden>
                            {[0, 1, 2, 3, 4].map((i) => (
                                <div key={i} className="h-9 animate-pulse rounded-lg bg-muted/60" />
                            ))}
                        </div>
                    </div>
                ) : error ? (
                    // 错误态：可重试（toast 已在请求失败时弹过）
                    <div className="flex flex-col items-center justify-center gap-2 px-4 py-16 text-center">
                        <div className="flex size-11 items-center justify-center rounded-full border bg-destructive/10">
                            <TriangleAlert className="size-5 text-destructive" />
                        </div>
                        <p className="text-sm font-medium text-foreground">订单加载失败</p>
                        <p className="max-w-md text-xs text-muted-foreground">{error}</p>
                        <Button variant="outline" size="sm" className="mt-1 h-8" onClick={retry}>
                            <RefreshCw size={14} />
                            重试
                        </Button>
                    </div>
                ) : orders.length === 0 ? (
                    // 空态：区分「有筛选但没匹配」与「确实没数据」
                    <div className="flex flex-col items-center justify-center gap-2 px-4 py-16 text-center">
                        <div className="flex size-11 items-center justify-center rounded-full border bg-muted/40">
                            <ShoppingCart className="size-5 text-muted-foreground/70" />
                        </div>
                        {hasAnyFilter(applied) ? (
                            <>
                                <p className="text-sm font-medium text-foreground">没有匹配的订单</p>
                                <p className="text-xs text-muted-foreground">当前筛选条件下没有结果，试试放宽条件或重置</p>
                                <Button variant="outline" size="sm" className="mt-1 h-8" onClick={resetFilters}>
                                    <RotateCcw size={14} />
                                    重置筛选
                                </Button>
                            </>
                        ) : (
                            <>
                                <p className="text-sm font-medium text-foreground">暂无订单</p>
                                <p className="text-xs text-muted-foreground">还没有订单数据</p>
                            </>
                        )}
                    </div>
                ) : (
                    orders.map((order) => {
                        const badge = statusBadge(order.payment_status);
                        return (
                            <div
                                key={order.id}
                                className={`grid grid-cols-1 items-center gap-x-3 gap-y-2 border-b px-4 py-3 text-sm transition-colors last:border-b-0 hover:bg-muted/40 sm:gap-y-1 ${rowMinW} ${rowGrid}`}
                            >
                                {/* order_no + trade_no */}
                                <div className="flex items-start gap-2">
                                    <ShoppingCart className="mt-0.5 size-4 shrink-0 text-muted-foreground/60" />
                                    <div className="min-w-0">
                                        <div className="truncate font-medium tabular-nums text-foreground">
                                            {order.order_no || "—"}
                                        </div>
                                        <div className="mt-0.5 truncate text-[11px] tabular-nums text-muted-foreground">
                                            {order.trade_no || "交易号 —"}
                                        </div>
                                    </div>
                                </div>
                                {/* order_type */}
                                <div>
                                    <span className="inline-block rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                                        {orderTypeLabel(order.order_type)}
                                    </span>
                                </div>
                                {/* user_email */}
                                <div className="truncate text-xs text-muted-foreground">{order.user_email || "—"}</div>
                                {/* amount + currency */}
                                <div>
                                    <span className="font-semibold tabular-nums text-primary">{money(order.amount)}</span>
                                    <span className="ml-1 text-xs text-muted-foreground">{order.currency || ""}</span>
                                </div>
                                {/* payment_provider */}
                                <div className="text-xs text-muted-foreground">
                                    {providerLabel(order.payment_provider)}
                                </div>
                                {/* payment_status */}
                                <div className="sm:text-center">
                                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}>
                                        {badge.label}
                                    </span>
                                </div>
                                {/* pay_time（可能为空：未支付） */}
                                <div className="text-xs tabular-nums text-muted-foreground">
                                    {/* 裸时间脱离表头看不懂，窄屏补个前缀 */}
                                    <span className="mr-1 sm:hidden">支付</span>
                                    {formatDateTime(order.pay_time)}
                                </div>
                                {/* created_at */}
                                <div className="text-xs tabular-nums text-muted-foreground">
                                    <span className="mr-1 sm:hidden">创建</span>
                                    {formatDateTime(order.created_at)}
                                </div>
                                {/* 操作：详情 / 关闭 / 退款（仍为占位，本次只做「读」） */}
                                <div className="flex items-center gap-1 sm:justify-end">
                                    <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        aria-label="详情"
                                        title="详情"
                                        className={ACTION_TONE.view}
                                        onClick={() => toast.info("订单详情待接入")}
                                    >
                                        <Eye className="size-4" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        aria-label="关闭订单"
                                        title="关闭订单"
                                        className={ACTION_TONE.neutral}
                                        onClick={() => toast.info("关闭订单待接入")}
                                    >
                                        <CircleX className="size-4" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        aria-label="退款"
                                        title="退款"
                                        className={ACTION_TONE.delete}
                                        onClick={() => toast.info("退款待接入")}
                                    >
                                        <Undo2 className="size-4" />
                                    </Button>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* 分页：固定在卡片底部，不随列表滚动 */}
            <div className="flex shrink-0 items-center justify-between gap-3 border-t bg-muted/40 px-4 py-2.5 text-xs text-muted-foreground">
                <span>
                    共 <span className="font-medium tabular-nums text-foreground">{total}</span> 条 · 第 {page} / {totalPages} 页
                </span>
                <PaginationControls
                    page={page}
                    totalPages={totalPages}
                    onPageChange={changePage}
                    disabled={loading}
                />
            </div>
        </div>
    );
}
