"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
    Banknote,
    CalendarPlus,
    CircleX,
    Clock,
    Download,
    Eye,
    RefreshCw,
    RotateCcw,
    Search,
    ShoppingCart,
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

/**
 * 订单管理页（静态外壳：只做视觉与布局，未接入任何接口，全部按钮为占位）。
 *
 * 接口情况（写在这里方便以后接）：
 *  - 远端路径：后端 PRO 模块 `/pro/admin/orders`
 *  - 同源代理：前端需要另建 `/api/admin/orders`（浏览器带登录 cookie 走同源）
 *  - 已线上探活确认存在（未登录返回 401）
 *  - 列表响应形状：`{ orders, total, page, size }`（注意是 `size`，不是 `page_size`；
 *    请求参数里分页字段才叫 `page_size`）
 *  - 查询参数：page / page_size / status / payment_provider / user_email / order_no /
 *    trade_no / order_type / start_date / end_date / sort_by / sort_order
 *
 * 接入步骤：
 *  1. `orders` / `total` / `page` 三个常量换成 useState，useEffect 里拉 `/api/admin/orders`；
 *  2. 补 loading / 错误 toast（本次不接，所以列表恒为空 → 走空态）；
 *  3. 各占位 onClick 换成真实动作（详情抽屉 / 关闭订单 / 退款）。
 *
 * 字段名与官方前端类型定义 `order.ts` 对齐（本仓库 src/types 暂无 orders.ts，
 * 接入时把下面这几个类型搬过去即可）。
 */
type OrderStatus = "PENDING" | "SUCCESS" | "FAILED" | "CANCELLED" | "EXPIRED";
type OrderType = "ARTICLE" | "SHARE" | "PRODUCT" | "MEMBERSHIP";
type PaymentProvider = "ALIPAY" | "WECHAT" | "EPAY" | "HUPIJIAO";

/** 列表项（只保留列表页会用到的字段） */
interface AdminOrder {
    id: number;
    order_no: string;
    order_type: OrderType;
    user_email: string;
    amount: number;
    currency: string;
    payment_provider: PaymentProvider;
    payment_status: OrderStatus;
    trade_no: string;
    pay_time?: string;
    created_at: string;
}

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

/** 筛选项：状态 / 支付方式 / 订单类型（枚举名与 order.ts 一致，展示用中文） */
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

/** 统计磁贴（本次没有接口，数值统一显示 —） */
const STAT_TILES = [
    { label: "订单总数", icon: ShoppingCart, tone: "text-foreground" },
    { label: "已支付金额", icon: Banknote, tone: "text-primary" },
    { label: "待支付", icon: Clock, tone: "text-amber-600 dark:text-amber-400" },
    { label: "今日新增", icon: CalendarPlus, tone: "text-emerald-600 dark:text-emerald-400" },
] as const;

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

/**
 * 订单管理页外壳：统计磁贴 + 筛选工具栏 + 列表（卡片内滚动、表头吸顶）+ 分页。
 * 布局与 globals.css 的 .admin-* 约定一致：卡片直系 flex 子元素里只有 .admin-scroll 一个滚动区。
 */
export function OrdersManager() {
    // ===== 筛选条件：全部为本地 state（能改、能打开下拉，但不过滤） =====
    const [orderNo, setOrderNo] = useState("");
    const [tradeNo, setTradeNo] = useState("");
    const [userEmail, setUserEmail] = useState("");
    const [status, setStatus] = useState("");
    const [provider, setProvider] = useState("");
    const [orderType, setOrderType] = useState("");
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");

    /** 接口接入前：列表恒为空，接入后换成接口返回的 orders / total / page */
    const orders: AdminOrder[] = [];
    const total = orders.length;
    const page = 1;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    /** 重置只清本地筛选（不涉及接口）；查询/刷新/导出等需要接口的动作一律占位 */
    const resetFilters = () => {
        setOrderNo("");
        setTradeNo("");
        setUserEmail("");
        setStatus("");
        setProvider("");
        setOrderType("");
        setStartDate("");
        setEndDate("");
    };

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
                {/* 左：筛选条件 + 占位查询按钮 */}
                <div className="flex flex-1 flex-wrap items-center gap-2">
                    {/* order_no */}
                    <Input
                        value={orderNo}
                        onChange={(e) => setOrderNo(e.target.value)}
                        placeholder="订单号"
                        aria-label="按订单号筛选"
                        className="h-8 w-36 text-sm"
                    />
                    {/* trade_no */}
                    <Input
                        value={tradeNo}
                        onChange={(e) => setTradeNo(e.target.value)}
                        placeholder="交易号"
                        aria-label="按交易号筛选"
                        className="h-8 w-36 text-sm"
                    />
                    {/* user_email */}
                    <Input
                        value={userEmail}
                        onChange={(e) => setUserEmail(e.target.value)}
                        placeholder="用户邮箱"
                        aria-label="按用户邮箱筛选"
                        className="h-8 w-44 text-sm"
                    />

                    {/* payment_status */}
                    <Select value={status} onValueChange={setStatus}>
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
                    <Select value={provider} onValueChange={setProvider}>
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
                    <Select value={orderType} onValueChange={setOrderType}>
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

                    {/* start_date / end_date：日期范围（本地 state，不过滤） */}
                    <div className="flex items-center gap-1.5">
                        <Input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            aria-label="开始日期"
                            className="h-8 w-36 text-sm"
                        />
                        <span className="text-xs text-muted-foreground">至</span>
                        <Input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            aria-label="结束日期"
                            className="h-8 w-36 text-sm"
                        />
                    </div>

                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() => toast.info("筛选查询待接入")}
                    >
                        <Search size={14} />
                        查询
                    </Button>
                    <Button variant="outline" size="sm" className="h-8" onClick={resetFilters}>
                        <RotateCcw size={14} />
                        重置
                    </Button>
                </div>

                {/* 右：刷新 / 导出（都为占位） */}
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

            {/* 列表：卡片内唯一滚动区（表头吸顶），统计磁贴 / 工具栏 / 分页都不动 */}
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

                {orders.length === 0 ? (
                    // 空态：接口未接入，列表恒为空
                    <div className="flex flex-col items-center justify-center gap-2 px-4 py-16 text-center">
                        <div className="flex size-11 items-center justify-center rounded-full border bg-muted/40">
                            <ShoppingCart className="size-5 text-muted-foreground/70" />
                        </div>
                        <p className="text-sm font-medium text-foreground">暂无订单</p>
                        <p className="text-xs text-muted-foreground">接口接入后显示</p>
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
                                {/* 操作：详情 / 关闭 / 退款（全部占位） */}
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

            {/* 分页：固定在卡片底部，不随列表滚动（本次恒为「共 0 条 · 第 1/1 页」并禁用） */}
            <div className="flex shrink-0 items-center justify-between gap-3 border-t bg-muted/40 px-4 py-2.5 text-xs text-muted-foreground">
                <span>
                    共 <span className="font-medium tabular-nums text-foreground">{total}</span> 条 · 第 {page} / {totalPages} 页
                </span>
                <PaginationControls
                    page={page}
                    totalPages={totalPages}
                    onPageChange={() => toast.info("分页待接入")}
                    disabled
                />
            </div>
        </div>
    );
}
