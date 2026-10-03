"use client";

/**
 * 商品管理（静态外壳）：统计磁贴 + 工具栏 + 表格外壳 + 分页，全部按钮为占位。
 *
 * ==== 接口情况（本次不接入，仅留档）====
 * - 后端 PRO 模块，远端 `/pro/admin/products`；同源代理需另建 `/api/admin/products`。
 * - 已线上探活确认接口存在（未登录返回 401）。
 * - 列表响应形如 `{ list, total, page, page_size }`，请求参数建议 `keyword` / `status` / `page` / `page_size`。
 * - 相关类型（后续接入时参考）：
 *     · StockItem（卡密库存）：`content` / `status`(Available=1 | Used=2 | Invalid=3) / `order_id` / `used_at`
 *     · ProductVariant（规格）：`name` / `price` / `delivery_method`(FIXED_REPLY | STOCK_ITEM) / `stock_count` / `sold_count`
 *
 * 本文件的字段名与官方前端类型定义 `product.ts` 对齐（ProductListItem / ProductStatus）。
 * 页面结构遵循后台列表页统一外壳：admin-card 内只有 admin-scroll 一个直系滚动子元素。
 */

import { useState } from "react";
import { toast } from "sonner";
import {
    KeyRound,
    Layers,
    Package,
    PackageOpen,
    Pencil,
    Plus,
    RefreshCw,
    RotateCcw,
    Search,
    Store,
    ToggleLeft,
    TrendingUp,
    Wallet,
    X,
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
import { resolveAssetUrl } from "@/lib/utils";

/** ProductStatus：与 product.ts 一致（Draft=1 / Published=2 / Offline=3） */
const ProductStatus = {
    Draft: 1,
    Published: 2,
    Offline: 3,
} as const;

const STATUS_OPTIONS = [
    { value: String(ProductStatus.Draft), label: "草稿" },
    { value: String(ProductStatus.Published), label: "已上架" },
    { value: String(ProductStatus.Offline), label: "已下架" },
];

/** 列表项：字段名取自官方前端类型定义 product.ts 的 ProductListItem */
interface ProductListItem {
    id: number;
    title: string;
    cover_url: string;
    status: number; // ProductStatus
    min_price: number;
    max_price: number;
    total_sales: number;
    total_revenue: number;
    variant_count: number;
    exclude_from_membership: boolean;
    show_on_homepage: boolean;
    created_at: string;
}

/** 状态徽章（ProductStatus：1=草稿 2=已上架 3=已下架） */
function statusBadge(status?: number) {
    if (status === ProductStatus.Published)
        return { label: "已上架", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" };
    if (status === ProductStatus.Draft)
        return { label: "草稿", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400" };
    if (status === ProductStatus.Offline) return { label: "已下架", cls: "bg-muted text-muted-foreground" };
    return { label: status == null ? "—" : String(status), cls: "bg-muted text-muted-foreground" };
}

/** 时间戳（YYYY-MM-DD HH:MM，本地时区） */
function formatDateTime(iso?: string): string {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 金额展示（保留两位小数） */
function money(value: unknown): string {
    const n = Number(value);
    return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

/**
 * 接口未接入：先用空列表渲染（行模板已按 ProductListItem 字段写好）。
 * 接入时把这里换成接口返回的 list，并补上 loading / total / page 状态即可。
 */
const PRODUCTS: ProductListItem[] = [];

// 移动端(<640px)：grid-cols-1 把每个单元格竖排成卡片；≥640px：恢复表格式列布局。
// min-w 只写在 sm: 以上 —— 窄屏若也撑宽，卡片就会被拉出横向滚动。
// 表头与数据行共用这套列宽，列顺序：商品 / 价格 / 规格数 / 销量 / 收入 / 状态 / 首页展示 / 创建时间 / 操作
const rowGrid = "sm:grid-cols-[minmax(0,1fr)_112px_56px_64px_104px_72px_72px_136px_148px]";
const rowMinW = "sm:min-w-[1060px]";

/** 单行模板：字段与 ProductListItem 一一对应（当前列表为空，接口接入后由 list 渲染） */
function ProductRow({ item }: { item: ProductListItem }) {
    const badge = statusBadge(item.status);
    return (
        <div
            className={`grid grid-cols-1 items-center gap-x-3 gap-y-2 border-b px-4 py-3 text-sm transition-colors last:border-b-0 hover:bg-muted/40 sm:gap-y-1 ${rowMinW} ${rowGrid}`}
        >
            {/* 商品：封面 cover_url + 标题 title */}
            <div className="flex min-w-0 items-center gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
                    {item.cover_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={resolveAssetUrl(item.cover_url) ?? item.cover_url}
                            alt=""
                            className="size-full object-cover"
                        />
                    ) : (
                        <Package className="size-4 text-muted-foreground/50" />
                    )}
                </div>
                <div className="min-w-0">
                    <div className="truncate font-medium text-foreground">{item.title || "—"}</div>
                    <div className="truncate text-xs text-muted-foreground">#{item.id}</div>
                </div>
            </div>
            {/* 价格：min_price ~ max_price（单一价格时只显示一个） */}
            <div className="text-xs tabular-nums">
                <span className="mr-1 text-muted-foreground sm:hidden">价格</span>
                <span className="font-semibold text-primary">
                    {Number(item.min_price) === Number(item.max_price)
                        ? `¥${money(item.min_price)}`
                        : `¥${money(item.min_price)} ~ ¥${money(item.max_price)}`}
                </span>
            </div>
            <div className="text-xs tabular-nums text-muted-foreground sm:text-center">
                <span className="mr-1 sm:hidden">规格数</span>
                {item.variant_count || 0}
            </div>
            <div className="text-xs tabular-nums text-muted-foreground sm:text-right">
                <span className="mr-1 sm:hidden">销量</span>
                {item.total_sales || 0}
            </div>
            <div className="text-xs tabular-nums sm:text-right">
                <span className="mr-1 text-muted-foreground sm:hidden">收入</span>
                <span className="font-medium text-foreground">¥{money(item.total_revenue)}</span>
            </div>
            <div className="sm:text-center">
                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}>
                    {badge.label}
                </span>
            </div>
            <div className="sm:text-center">
                <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        item.show_on_homepage
                            ? "bg-sky-500/15 text-sky-600 dark:text-sky-400"
                            : "bg-muted text-muted-foreground"
                    }`}
                >
                    {item.show_on_homepage ? "是" : "否"}
                </span>
            </div>
            <div className="text-xs text-muted-foreground">{formatDateTime(item.created_at)}</div>
            {/* 操作列：编辑 / 规格 / 库存 / 上下架，全部占位 */}
            <div className="flex items-center gap-1 sm:justify-center">
                <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="编辑"
                    title="编辑"
                    className={ACTION_TONE.edit}
                    onClick={() => toast.info("编辑商品待接入")}
                >
                    <Pencil className="size-4" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="规格管理"
                    title="规格管理"
                    className={ACTION_TONE.pin}
                    onClick={() => toast.info("规格管理待接入")}
                >
                    <Layers className="size-4" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="卡密库存"
                    title="卡密库存"
                    className={ACTION_TONE.key}
                    onClick={() => toast.info("卡密库存待接入")}
                >
                    <KeyRound className="size-4" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="上下架"
                    title="上下架"
                    className={ACTION_TONE.approve}
                    onClick={() => toast.info("上下架待接入")}
                >
                    <ToggleLeft className="size-4" />
                </Button>
            </div>
        </div>
    );
}

/**
 * 商品管理页外壳：统计磁贴 + 工具栏（新增/搜索/状态筛选/卡密库存）+ 表格 + 分页。
 * 所有按钮均为占位（toast.info），不发任何网络请求。
 */
export function ProductsManager() {
    /** 搜索框（本地 state，能输入但不过滤） */
    const [input, setInput] = useState("");
    /** 状态筛选（本地 state，能打开但不过滤） */
    const [status, setStatus] = useState("all");

    const list = PRODUCTS;
    const total = 0;
    const page = 1;
    const totalPages = Math.max(1, Math.ceil(total / 10));

    return (
        // admin-card：吃掉剩余高度，列表区域（admin-scroll）在卡片内部滚动，不再顶高整页
        <div className="admin-card">
            {/* 统计磁贴：固定在卡片顶部（shrink-0），不随列表滚动。数值等接口接入后才显示 */}
            <div className="grid shrink-0 grid-cols-2 gap-2 border-b p-3 md:grid-cols-4">
                <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Package className="size-4" />
                    </span>
                    <div className="min-w-0">
                        <p className="truncate text-xs text-muted-foreground">商品总数</p>
                        <p className="text-lg font-semibold tabular-nums">—</p>
                    </div>
                </div>
                <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        <Store className="size-4" />
                    </span>
                    <div className="min-w-0">
                        <p className="truncate text-xs text-muted-foreground">已上架</p>
                        <p className="text-lg font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                            —
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
                        <TrendingUp className="size-4" />
                    </span>
                    <div className="min-w-0">
                        <p className="truncate text-xs text-muted-foreground">总销量</p>
                        <p className="text-lg font-semibold tabular-nums text-violet-600 dark:text-violet-400">
                            —
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                        <Wallet className="size-4" />
                    </span>
                    <div className="min-w-0">
                        <p className="truncate text-xs text-muted-foreground">总收入</p>
                        <p className="text-lg font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                            —
                        </p>
                    </div>
                </div>
            </div>

            {/* 工具栏：固定在卡片顶部（shrink-0），不随下方表格滚动。
                左：搜索 + 状态筛选 + 重置；右：新增商品 / 卡密库存 / 刷新（全部占位） */}
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b p-3">
                <div className="flex flex-1 flex-wrap items-center gap-2">
                    <div className="relative w-56">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") toast.info("商品搜索待接入");
                            }}
                            placeholder="搜索商品标题"
                            className="h-8 pl-8 pr-8 text-sm"
                            aria-label="搜索商品"
                        />
                        {input && (
                            <button
                                type="button"
                                onClick={() => setInput("")}
                                aria-label="清空搜索"
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>

                    {/* 状态筛选：本地 state 可打开，暂不过滤（接口未接入） */}
                    <Select value={status} onValueChange={setStatus}>
                        <SelectTrigger className="h-8 w-28 shrink-0">
                            <SelectValue placeholder="商品状态" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">全部状态</SelectItem>
                            {STATUS_OPTIONS.map((o) => (
                                <SelectItem key={o.value} value={o.value}>
                                    {o.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() => toast.info("重置筛选待接入")}
                    >
                        <RotateCcw size={14} />
                        重置
                    </Button>

                    <span className="text-xs text-muted-foreground">
                        共 <span className="font-medium text-foreground">{total}</span> 件商品
                    </span>
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        size="sm"
                        className="h-8 bg-primary text-primary-foreground hover:bg-primary/90"
                        onClick={() => toast.info("新增商品待接入")}
                    >
                        <Plus size={14} />
                        新增商品
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() => toast.info("卡密库存待接入")}
                    >
                        <KeyRound size={14} />
                        卡密库存
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() => toast.info("刷新待接入")}
                    >
                        <RefreshCw size={14} />
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
                    <span>商品</span>
                    <span>价格</span>
                    <span className="text-center">规格数</span>
                    <span className="text-right">销量</span>
                    <span className="text-right">收入</span>
                    <span className="text-center">状态</span>
                    <span className="text-center">首页展示</span>
                    <span>创建时间</span>
                    <span className="text-center">操作</span>
                </div>

                {list.length === 0 ? (
                    // 空态：图标 + 主文案 + 副文案 + 一个占位入口
                    <div className="flex min-h-64 flex-col items-center justify-center gap-2 px-4 py-12 text-center">
                        <span className="flex size-12 items-center justify-center rounded-full bg-muted">
                            <PackageOpen className="size-6 text-muted-foreground/60" />
                        </span>
                        <p className="text-sm font-medium text-foreground">暂无商品</p>
                        <p className="text-xs text-muted-foreground">接口接入后显示</p>
                        <Button
                            variant="outline"
                            size="sm"
                            className="mt-1 h-8 rounded-lg text-xs"
                            onClick={() => toast.info("新增商品待接入")}
                        >
                            <Plus className="size-3.5" />
                            新增商品
                        </Button>
                    </div>
                ) : (
                    list.map((item) => <ProductRow key={item.id} item={item} />)
                )}
            </div>

            {/* 分页：固定在卡片底部，不随列表滚动；无数据时展示 0 条并禁用 */}
            <div className="flex shrink-0 items-center justify-between gap-3 border-t bg-muted/40 px-4 py-2.5 text-xs text-muted-foreground">
                <span>
                    共 {total} 条 · 第 {page}/{totalPages} 页
                </span>
                <PaginationControls
                    page={page}
                    totalPages={totalPages}
                    onPageChange={() => {}}
                    disabled
                />
            </div>
        </div>
    );
}
