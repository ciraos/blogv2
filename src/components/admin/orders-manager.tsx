"use client";

import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { toast } from "sonner";
import {
    Banknote,
    CalendarPlus,
    Clock,
    Download,
    Eye,
    Loader2,
    RefreshCw,
    RotateCcw,
    ShoppingCart,
    Trash2,
    TriangleAlert,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatStrip } from "@/components/admin/stat-strip";
import { AdminFilterBar } from "@/components/admin/filter-bar";
import { AdminEmptyState } from "@/components/admin/empty-state";
import { useConfirm } from "@/components/confirm-provider";
import { Input } from "@/components/ui/input";
import { PaginationControls } from "@/components/pagination-controls";
import { StatusDot } from "@/components/admin/status-dot";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { ACTION_TONE } from "@/lib/action-tones";
import { getAdminOrdersApi } from "@/lib/api";
import {
    deleteAdminOrderApi,
    listAdminOrdersByPostApi,
    orderToDetail,
    type AdminOrderDetail,
} from "@/lib/api-orders-products";
import type {
    AdminOrder,
    AdminOrderListParams,
    OrderStatus,
    OrderType,
    PaymentProvider,
} from "@/types/orders";

/**
 * 订单管理页：统计磁贴 + 筛选工具栏 + 列表（卡片内滚动、表头吸顶）+ 分页 + 详情弹窗。
 *
 * 接口（权威来源：官方前端快照 scripts/theme/theme-anheyu-next-main/src/lib/api/order.ts）
 *   GET    /pro/admin/orders          L13-15  列表（走 api.ts 的 getAdminOrdersApi）
 *   POST   /pro/admin/orders/list     L20-22  带筛选的列表（详情弹窗用它按订单号补全字段）
 *   DELETE /pro/admin/orders/{id}     L27-29  **软删除**
 *   浏览器经同源代理 /api/admin/orders* 转发（见 src/app/api/admin/orders/）。
 *   ⚠️ 响应分页字段是 `size`（不是 `page_size`）；请求参数里分页字段才叫 `page_size`。
 *
 * 已接的操作：
 *   ✅ 列表加载 + 筛选 + 分页 + 详情弹窗 + 软删除（二次确认）+ 导出当前页 CSV（纯前端生成）
 *   ⛔ 「关闭订单 / 退款」已**删除**：后端没有对应接口（官方 order.ts 里只有列表 / POST 列表 / 软删除），
 *      留着只能是假按钮。
 *   ⛔ 统计磁贴只接得上「订单总数」（列表响应 total），其余三项后端没有统计接口，显示「—」。
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

/**
 * 统计磁贴：只有「订单总数」有真数据（列表响应的 total），
 * 其余三项后端没有统计接口 → 显示「—」并在 title 里说明，不做假数字。
 */
const STAT_TILES = [
    { key: "total", label: "订单总数", icon: ShoppingCart, tone: "text-foreground" },
    { key: "paid", label: "已支付金额", icon: Banknote, tone: "text-primary" },
    { key: "pending", label: "待支付", icon: Clock, tone: "text-amber-600 dark:text-amber-400" },
    { key: "today", label: "今日新增", icon: CalendarPlus, tone: "text-emerald-600 dark:text-emerald-400" },
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

/** 金额展示（两位小数；订单金额单位是元，见官方 orders/page.tsx L341 直接 toFixed(2)） */
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

/** CSV 单元格转义（值里可能带逗号/引号/换行） */
function csvCell(value: unknown): string {
    const s = value === undefined || value === null ? "" : String(value);
    return `"${s.replace(/"/g, '""')}"`;
}

/** 弹窗里的「标签 + 值」小格 */
function Meta({ label, value }: { label: string; value: ReactNode }) {
    return (
        <div className="min-w-0">
            <p className="text-muted-foreground">{label}</p>
            <p className="mt-0.5 break-words text-foreground">{value}</p>
        </div>
    );
}

/** 详情弹窗里的「关联对象」：订单类型不同，关联的字段也不同，只渲染有值的那些 */
function relatedText(detail: AdminOrderDetail): string {
    const parts: string[] = [];
    if (detail.article_id) parts.push(`文章 ${detail.article_id}`);
    if (detail.share_id) parts.push(`分享 ${detail.share_id}`);
    if (detail.product_id != null) parts.push(`商品 #${detail.product_id}`);
    if (detail.variant_id != null) parts.push(`型号 #${detail.variant_id}`);
    if (detail.membership_plan_id != null) parts.push(`会员套餐 #${detail.membership_plan_id}`);
    return parts.length ? parts.join(" · ") : "—";
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
    /** 非筛选类重拉（错误态重试 / 写操作后刷新 / 工具栏「刷新」）；变更即触发 effect */
    const [reloadKey, setReloadKey] = useState(0);

    // ===== 详情弹窗 / 写操作 =====
    /** 当前查看的订单（先用列表行兜底，再尝试用 POST /orders/list 补全） */
    const [detail, setDetail] = useState<AdminOrderDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    /** 正在删除的订单 id（禁用该行按钮，避免重复提交） */
    const [actingId, setActingId] = useState<number | null>(null);

    /** 请求序号：只认最后一次请求的结果，避免快速切筛选/翻页时旧响应覆盖新数据 */
    const reqSeq = useRef(0);

    // 应用内确认弹窗（替代 window.confirm，见 components/confirm-provider.tsx）
    const confirm = useConfirm();

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

    /**
     * 打开详情：先用列表行渲染（立刻出内容），再用带筛选的 POST /orders/list 按订单号补全。
     * 为什么这么做：官方**没有** GET /orders/{id}，列表项字段比详情少
     * （user_id / 关联对象 / client_ip / user_agent / expire_time 只有列表接口会给）。
     * 补全失败不影响弹窗（静默保留列表字段），不弹错误 toast 干扰用户。
     */
    const openDetail = async (order: AdminOrder) => {
        setDetail(orderToDetail(order));
        if (!order.order_no) return;
        setDetailLoading(true);
        try {
            const data = await listAdminOrdersByPostApi({ order_no: order.order_no, page: 1, page_size: 5 });
            const fresh = data.orders.find((o) => o.id === order.id) ?? data.orders[0];
            if (fresh) setDetail(fresh);
        } catch {
            // 详情补全失败：保留列表行数据
        } finally {
            setDetailLoading(false);
        }
    };

    /** 软删除（二次确认）：远端 DELETE /pro/admin/orders/{id}，本轮未实测 */
    const removeOrder = async (id: number, label: string) => {
        if (
            !(await confirm({
                title: `确定删除订单「${label}」吗？`,
                description: "这是软删除：后端仍保留该订单记录，但订单列表里不再显示。",
                danger: true,
            }))
        )
            return;

        setActingId(id);
        try {
            await deleteAdminOrderApi(id);
            toast.success("订单已删除");
            if (detail?.id === id) setDetail(null);
            // 删掉当前页最后一条且后面还有页时回退一页，避免停在空页
            if (orders.length === 1 && page > 1) setPage((p) => p - 1);
            else retry();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "删除订单失败");
        } finally {
            setActingId(null);
        }
    };

    /**
     * 导出当前页为 CSV（纯前端生成）。
     * 后端**没有**订单导出接口（官方 order.ts 全文件只有列表 / POST 列表 / 软删除），
     * 所以这里照 supports-manager 的做法，用 Blob + 临时 <a download> 在前端拼 CSV，不新增依赖。
     */
    const handleExport = () => {
        if (orders.length === 0) {
            toast.info("当前页没有可导出的订单");
            return;
        }
        const header = ["订单号", "交易号", "类型", "用户邮箱", "金额", "币种", "支付方式", "状态", "支付时间", "创建时间"];
        const rows = orders.map((o) =>
            [
                o.order_no,
                o.trade_no,
                orderTypeLabel(o.order_type),
                o.user_email,
                money(o.amount),
                o.currency,
                providerLabel(o.payment_provider),
                statusBadge(o.payment_status).label,
                formatDateTime(o.pay_time),
                formatDateTime(o.created_at),
            ]
                .map(csvCell)
                .join(",")
        );
        // BOM 让 Excel 正确识别 UTF-8 中文
        const csv = `\uFEFF${[header.map(csvCell).join(","), ...rows].join("\r\n")}`;
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `orders-page${page}-${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(url);
        toast.success("已导出当前页订单");
    };

    // 任何宽度都用同一套列模板：窄屏靠 .admin-scroll 横向滚动、操作列 sticky 固定，不再折成卡片。
    // 窄屏也保持 min-w：整张表横向滚动，列不会被压扁。
    const rowGrid = "grid-cols-[minmax(0,1fr)_84px_150px_92px_92px_84px_128px_128px_120px]";
    const rowMinW = "min-w-[1060px]";

    return (
        // admin-card：吃掉剩余高度，列表区域（admin-scroll）在卡片内部滚动，不再顶高整页
        <div className="admin-card">
            {/* 统计：读数条（共用 StatStrip）。
                只有「订单总数」有真数据（列表 total），其余三项后端没有接口 → 显示「—」 */}
            <StatStrip
                items={STAT_TILES.map((tile) => ({
                    label: tile.label,
                    value:
                        tile.key === "total" ? (loading ? "—" : total) : "—",
                }))}
            />

            {/* 工具栏：统一工具条，固定在卡片顶部（shrink-0），不随下方列表滚动 */}
            <AdminFilterBar
                search={{
                    value: draft.orderNo,
                    onChange: (v) => setDraft((prev) => ({ ...prev, orderNo: v })),
                    placeholder: "订单号",
                    ariaLabel: "按订单号筛选",
                }}
                onSubmit={runQuery}
                onReset={resetFilters}
                resetDisabled={
                    !draft.orderNo &&
                    !draft.tradeNo &&
                    !draft.userEmail &&
                    !draft.status &&
                    !draft.provider &&
                    !draft.orderType &&
                    !draft.startDate &&
                    !draft.endDate
                }
            >
                    {/* trade_no */}
                    <Input
                        value={draft.tradeNo}
                        onChange={(e) => setDraft((prev) => ({ ...prev, tradeNo: e.target.value }))}
                        onKeyDown={handleEnter}
                        placeholder="交易号"
                        aria-label="按交易号筛选"
                        className="h-8 w-full text-sm sm:w-36"
                    />
                    {/* user_email */}
                    <Input
                        value={draft.userEmail}
                        onChange={(e) => setDraft((prev) => ({ ...prev, userEmail: e.target.value }))}
                        onKeyDown={handleEnter}
                        placeholder="用户邮箱"
                        aria-label="按用户邮箱筛选"
                        className="h-8 w-full text-sm sm:w-44"
                    />

                    {/* payment_status（下拉变更立即查询） */}
                    <Select value={draft.status} onValueChange={(v) => commit({ status: v })}>
                        <SelectTrigger className="h-8 w-full shrink-0 sm:w-28" aria-label="按订单状态筛选">
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
                        <SelectTrigger className="h-8 w-full shrink-0 sm:w-28" aria-label="按支付方式筛选">
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
                        <SelectTrigger className="h-8 w-full shrink-0 sm:w-26" aria-label="按订单类型筛选">
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

                    {/* start_date / end_date：日期范围（回车提交）。窄屏两个日期输入等分一行 */}
                    <div className="flex w-full items-center gap-1.5">
                        <Input
                            type="date"
                            value={draft.startDate}
                            onChange={(e) => setDraft((prev) => ({ ...prev, startDate: e.target.value }))}
                            onKeyDown={handleEnter}
                            aria-label="开始日期"
                            className="h-8 w-full min-w-0 text-sm sm:w-36"
                        />
                        <span className="text-xs text-muted-foreground">至</span>
                        <Input
                            type="date"
                            value={draft.endDate}
                            onChange={(e) => setDraft((prev) => ({ ...prev, endDate: e.target.value }))}
                            onKeyDown={handleEnter}
                            aria-label="结束日期"
                            className="h-8 w-full min-w-0 text-sm sm:w-36"
                        />
                    </div>

                {/* 右：刷新（真重拉）/ 导出（前端 CSV —— 后端没有导出接口） */}
                <div className="col-span-2 order-last flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
                    <Button variant="outline" size="sm" className="h-8 shrink-0" onClick={retry} disabled={loading}>
                        <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                        <span className="hidden sm:inline">刷新</span>
                    </Button>
                    <Button variant="outline" size="sm" className="h-8 shrink-0" onClick={handleExport}>
                        <Download size={14} />
                        <span className="hidden sm:inline">导出本页</span>
                    </Button>
                </div>
            </AdminFilterBar>

            {/* 列表：卡片内唯一滚动区（表头吸顶），统计磁贴 / 工具栏 / 分页都不动。
                三种状态都渲染在这一个 .admin-scroll 里，外壳结构保持不变。 */}
            <div className="admin-scroll">
                {/* 表头：任何宽度都显示（窄屏横向滚动时需要列名） */}
                <div className={`admin-sticky-head admin-list-head items-center gap-3 border-b px-4 py-2 text-xs font-medium text-muted-foreground grid ${rowMinW} ${rowGrid}`}>
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
                    <div className="flex flex-col items-center justify-center gap-3 px-4 py-8 text-center">
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
                    <div className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center">
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
                    <AdminEmptyState
                        kind="orders"
                        filtered={hasAnyFilter(applied)}
                        action={
                            hasAnyFilter(applied) ? (
                                <Button variant="outline" size="sm" className="h-8" onClick={resetFilters}>
                                    <RotateCcw size={14} />
                                    重置筛选
                                </Button>
                            ) : undefined
                        }
                    />
                ) : (
                    orders.map((order) => {
                        const badge = statusBadge(order.payment_status);
                        return (
                            <div
                                key={order.id}
                                className={`grid admin-list-row items-center gap-x-3 gap-y-2 border-b px-4 py-3 text-sm transition-colors last:border-b-0 hover:bg-muted/40 sm:gap-y-1 ${rowMinW} ${rowGrid}`}
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
                                    <StatusDot cls={badge.cls}>{badge.label}</StatusDot>
                                </div>
                                {/* pay_time（可能为空：未支付） */}
                                <div className="text-xs tabular-nums text-muted-foreground">
                                    {/* 裸时间脱离表头看不懂，窄屏补个前缀 */}
                                    {formatDateTime(order.pay_time)}
                                </div>
                                {/* created_at */}
                                <div className="text-xs tabular-nums text-muted-foreground">
                                    {formatDateTime(order.created_at)}
                                </div>
                                {/* 操作：详情 / 删除（软删除）。
                                    原来的「关闭订单 / 退款」已删除 —— 后端没有对应接口，留着只能是假按钮 */}
                                <div className="flex items-center gap-1 sm:justify-end">
                                    <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        aria-label="详情"
                                        title="详情"
                                        className={ACTION_TONE.view}
                                        onClick={() => void openDetail(order)}
                                    >
                                        <Eye className="size-4" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        aria-label="删除订单"
                                        title="删除订单（软删除）"
                                        className={ACTION_TONE.delete}
                                        disabled={actingId === order.id}
                                        onClick={() => void removeOrder(order.id, order.order_no || `#${order.id}`)}
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

            {/* ===== 订单详情弹窗 =====
                官方没有 GET /orders/{id}：先用列表行渲染，再用 POST /orders/list 按订单号补全字段。
                这里是只读弹窗，写操作只有「删除订单」（二次确认）。 */}
            {detail && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
                    onMouseDown={() => setDetail(null)}
                >
                    <div
                        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border bg-card p-4 shadow-sm"
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        <div className="mb-3 flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <h3 className="truncate font-mono text-base font-semibold">
                                        {detail.order_no || `订单 #${detail.id}`}
                                    </h3>
                                    <StatusDot cls={statusBadge(detail.payment_status).cls} className="shrink-0">
                                        {statusBadge(detail.payment_status).label}
                                    </StatusDot>
                                    <span className="inline-block shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                                        {orderTypeLabel(detail.order_type)}
                                    </span>
                                    {detailLoading && (
                                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                            <Loader2 className="size-3 animate-spin" />
                                            加载完整详情…
                                        </span>
                                    )}
                                </div>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    订单号与交易号来自订单接口；金额单位为元
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

                        <div className="min-h-0 flex-1 overflow-auto">
                            <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs sm:grid-cols-3">
                                <Meta label="金额" value={`${money(detail.amount)} ${detail.currency || ""}`.trim()} />
                                <Meta label="支付方式" value={providerLabel(detail.payment_provider)} />
                                <Meta label="交易号" value={<span className="font-mono">{detail.trade_no || "—"}</span>} />
                                <Meta label="用户邮箱" value={detail.user_email || "—"} />
                                <Meta label="用户 ID" value={detail.user_id ?? "—"} />
                                <Meta label="关联对象" value={relatedText(detail)} />
                                <Meta label="支付时间" value={formatDateTime(detail.pay_time)} />
                                <Meta label="创建时间" value={formatDateTime(detail.created_at)} />
                                <Meta label="更新时间" value={formatDateTime(detail.updated_at)} />
                                <Meta label="过期时间" value={formatDateTime(detail.expire_time)} />
                                <Meta label="客户端 IP" value={detail.client_ip || "—"} />
                                <Meta label="订单 ID" value={detail.id} />
                            </div>

                            <div className="mt-3 rounded-lg border bg-muted/30 p-3 text-xs">
                                <p className="text-muted-foreground">User-Agent</p>
                                <p className="mt-1 break-all text-foreground">{detail.user_agent || "—"}</p>
                            </div>
                        </div>

                        <div className="mt-3 flex shrink-0 flex-wrap justify-end gap-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                className={ACTION_TONE.delete}
                                disabled={actingId === detail.id}
                                onClick={() => void removeOrder(detail.id, detail.order_no || `#${detail.id}`)}
                            >
                                <Trash2 className="size-3.5" />
                                删除订单（软删除）
                            </Button>
                            <div className="flex-1" />
                            <Button variant="outline" onClick={() => setDetail(null)}>
                                关闭窗口
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
