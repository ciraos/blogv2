"use client";

/**
 * 商品管理：统计磁贴 + 工具栏（关键词 / 状态筛选）+ 表格外壳 + 分页。
 *
 * 本次只做「读」：列表数据来自 `getAdminProductsApi`（同源 /api/admin/products → 远端 /pro/admin/products），
 * 新增 / 编辑 / 规格 / 卡密库存 / 上下架等写操作仍为占位（toast.info）。
 *
 * 分页字段：响应 `{ list, total, page, page_size }`；请求参数 keyword / status / page / page_size。
 *
 * 页面结构遵循后台列表页统一外壳：admin-card 内只有 admin-scroll 一个直系滚动子元素。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
    CircleAlert,
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
import { Skeleton } from "@/components/ui/skeleton";
import { PaginationControls } from "@/components/pagination-controls";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { ACTION_TONE } from "@/lib/action-tones";
import { getAdminProductsApi } from "@/lib/api";
import { resolveAssetUrl } from "@/lib/utils";
import { ProductStatus, type ProductListItem, type ProductStatusValue } from "@/types/products";

/** 每页条数（请求参数 page_size） */
const PAGE_SIZE = 10;

/** 状态筛选常量：值的字符串形态与 ProductStatus 对齐 */
const STATUS_OPTIONS: { value: string; label: string }[] = [
    { value: String(ProductStatus.Draft), label: "草稿" },
    { value: String(ProductStatus.Published), label: "已上架" },
    { value: String(ProductStatus.Offline), label: "已下架" },
];

/** 把下拉框的字符串值收敛成接口要的 ProductStatusValue（"all" / 空串 / 非法值都返回 undefined） */
function parseStatusFilter(value: string): ProductStatusValue | undefined {
    if (value === String(ProductStatus.Draft)) return ProductStatus.Draft;
    if (value === String(ProductStatus.Published)) return ProductStatus.Published;
    if (value === String(ProductStatus.Offline)) return ProductStatus.Offline;
    return undefined;
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

// 移动端(<640px)：grid-cols-1 把每个单元格竖排成卡片；≥640px：恢复表格式列布局。
// min-w 只写在 sm: 以上 —— 窄屏若也撑宽，卡片就会被拉出横向滚动。
// 表头与数据行共用这套列宽，列顺序：商品 / 价格 / 规格数 / 销量 / 收入 / 状态 / 首页展示 / 创建时间 / 操作
const rowGrid = "sm:grid-cols-[minmax(0,1fr)_112px_56px_64px_104px_72px_72px_136px_148px]";
const rowMinW = "sm:min-w-[1060px]";

/** 骨架行：列宽与真实行完全一致，加载时表格不跳版 */
function ProductRowSkeleton() {
    return (
        <div
            className={`grid grid-cols-1 items-center gap-x-3 gap-y-2 border-b px-4 py-3 last:border-b-0 sm:gap-y-1 ${rowMinW} ${rowGrid}`}
        >
            <div className="flex min-w-0 items-center gap-3">
                <Skeleton className="size-9 shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-2/3" />
                    <Skeleton className="h-3 w-1/4" />
                </div>
            </div>
            <Skeleton className="h-3.5 w-16" />
            <Skeleton className="h-3.5 w-6 sm:mx-auto" />
            <Skeleton className="h-3.5 w-8 sm:ml-auto" />
            <Skeleton className="h-3.5 w-12 sm:ml-auto" />
            <Skeleton className="h-4 w-12 rounded-full sm:mx-auto" />
            <Skeleton className="h-4 w-8 rounded-full sm:mx-auto" />
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-7 w-28" />
        </div>
    );
}

/** 单行模板：字段与 ProductListItem 一一对应；操作列仍为占位 */
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
 * 列表数据来自接口（读），其余按钮为占位（toast.info）。
 */
export function ProductsManager() {
    /** 搜索框输入值（受控，回车/清空时才发起请求） */
    const [input, setInput] = useState("");
    /** 已生效的关键词（接口参数 keyword） */
    const [keyword, setKeyword] = useState("");
    /** 状态筛选（"all" = 不筛选；接口参数 status） */
    const [status, setStatus] = useState("all");
    /** 当前页（接口参数 page） */
    const [page, setPage] = useState(1);

    /** 接口数据 */
    const [list, setList] = useState<ProductListItem[]>([]);
    const [total, setTotal] = useState(0);
    const [pageSize, setPageSize] = useState(PAGE_SIZE);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    /** 请求序号：只让最后一次请求的结果落地（避免快速切页/筛选时旧响应覆盖新数据） */
    const reqIdRef = useRef(0);

    const fetchProducts = useCallback(async () => {
        const reqId = ++reqIdRef.current;
        setLoading(true);
        setError(null);
        try {
            const data = await getAdminProductsApi({
                page,
                page_size: PAGE_SIZE,
                // 空串 / 未选择 → undefined（URL 里就不带这个参数）
                keyword: keyword.trim() || undefined,
                status: parseStatusFilter(status),
            });
            if (reqId !== reqIdRef.current) return;
            setList(Array.isArray(data?.list) ? data.list : []);
            setTotal(Number(data?.total) || 0);
            setPageSize(Number(data?.page_size) || PAGE_SIZE);
        } catch (err) {
            if (reqId !== reqIdRef.current) return;
            const message = err instanceof Error && err.message ? err.message : "商品列表加载失败";
            setError(message);
            setList([]);
            setTotal(0);
            toast.error(message);
        } finally {
            if (reqId === reqIdRef.current) setLoading(false);
        }
    }, [page, keyword, status]);

    useEffect(() => {
        // 挂载/筛选变化时拉列表：setState 都发生在请求 await 之后。
        // 该规则对经过 useCallback 的异步取数判得过严，这里显式豁免（与 article-history 同处理）。
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void fetchProducts();
    }, [fetchProducts]);

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const currentPage = Math.min(Math.max(1, page), totalPages);

    /** 是否有生效中的筛选（决定空态文案） */
    const hasFilter = Boolean(keyword.trim()) || status !== "all";

    /** 仅首屏（还没有任何数据）显示骨架；切页/刷新时保留旧列表，避免闪屏 */
    const initialLoading = loading && list.length === 0 && page === 1 && !hasFilter;

    /** 磁贴：商品总数取接口 total；已上架 / 销量 / 收入按当前页数据汇总 */
    const publishedCount = list.filter((p) => p.status === ProductStatus.Published).length;
    const salesSum = list.reduce((sum, p) => sum + (Number(p.total_sales) || 0), 0);
    const revenueSum = list.reduce((sum, p) => sum + (Number(p.total_revenue) || 0), 0);

    /** 重置筛选：清关键词 + 状态，并回到第 1 页 */
    const resetFilters = () => {
        setInput("");
        setKeyword("");
        setStatus("all");
        setPage(1);
    };

    /** 关键词生效（回车触发） */
    const applyKeyword = () => {
        setKeyword(input.trim());
        setPage(1);
    };

    return (
        // admin-card：吃掉剩余高度，列表区域（admin-scroll）在卡片内部滚动，不再顶高整页
        <div className="admin-card">
            {/* 统计磁贴：固定在卡片顶部（shrink-0），不随列表滚动 */}
            <div className="grid shrink-0 grid-cols-2 gap-2 border-b p-3 md:grid-cols-4">
                <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Package className="size-4" />
                    </span>
                    <div className="min-w-0">
                        <p className="truncate text-xs text-muted-foreground">商品总数</p>
                        <p className="text-lg font-semibold tabular-nums">{loading ? "—" : total}</p>
                    </div>
                </div>
                <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        <Store className="size-4" />
                    </span>
                    <div className="min-w-0">
                        <p className="truncate text-xs text-muted-foreground">已上架（本页）</p>
                        <p className="text-lg font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                            {loading ? "—" : publishedCount}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
                        <TrendingUp className="size-4" />
                    </span>
                    <div className="min-w-0">
                        <p className="truncate text-xs text-muted-foreground">总销量（本页）</p>
                        <p className="text-lg font-semibold tabular-nums text-violet-600 dark:text-violet-400">
                            {loading ? "—" : salesSum}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                        <Wallet className="size-4" />
                    </span>
                    <div className="min-w-0">
                        <p className="truncate text-xs text-muted-foreground">总收入（本页）</p>
                        <p className="text-lg font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                            {loading ? "—" : `¥${money(revenueSum)}`}
                        </p>
                    </div>
                </div>
            </div>

            {/* 工具栏：固定在卡片顶部（shrink-0），不随下方表格滚动。
                左：搜索 + 状态筛选 + 重置；右：新增商品 / 卡密库存 / 刷新（除搜索/筛选/重置外均为占位） */}
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b p-3">
                <div className="flex flex-1 flex-wrap items-center gap-2">
                    <div className="relative w-56">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => {
                                // 回车才真正按 keyword 查询（输入过程不打扰）
                                if (e.key === "Enter") applyKeyword();
                            }}
                            placeholder="搜索商品标题（回车）"
                            className="h-8 pl-8 pr-8 text-sm"
                            aria-label="搜索商品"
                        />
                        {input && (
                            <button
                                type="button"
                                onClick={() => {
                                    setInput("");
                                    setKeyword("");
                                    setPage(1);
                                }}
                                aria-label="清空搜索"
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>

                    {/* 状态筛选：切换即查询（回到第 1 页） */}
                    <Select
                        value={status}
                        onValueChange={(value) => {
                            setStatus(value);
                            setPage(1);
                        }}
                    >
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
                        onClick={resetFilters}
                        disabled={!hasFilter}
                    >
                        <RotateCcw size={14} />
                        重置
                    </Button>

                    <span className="text-xs text-muted-foreground">
                        共 <span className="font-medium tabular-nums text-foreground">{total}</span> 件商品
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

                {initialLoading ? (
                    // 加载中：骨架行（列宽与真实行一致）
                    <div aria-busy="true" aria-label="商品列表加载中">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <ProductRowSkeleton key={i} />
                        ))}
                    </div>
                ) : error ? (
                    // 错误态：文案 + 重试（toast 已在请求失败时弹出）
                    <div className="flex min-h-64 flex-col items-center justify-center gap-2 px-4 py-12 text-center">
                        <span className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
                            <CircleAlert className="size-6 text-destructive" />
                        </span>
                        <p className="text-sm font-medium text-foreground">商品列表加载失败</p>
                        <p className="max-w-md text-xs text-muted-foreground">{error}</p>
                        <Button
                            variant="outline"
                            size="sm"
                            className="mt-1 h-8 rounded-lg text-xs"
                            onClick={() => void fetchProducts()}
                            disabled={loading}
                        >
                            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
                            重试
                        </Button>
                    </div>
                ) : list.length === 0 ? (
                    // 空态：「有筛选没匹配」与「确实没数据」区分文案
                    <div className="flex min-h-64 flex-col items-center justify-center gap-2 px-4 py-12 text-center">
                        <span className="flex size-12 items-center justify-center rounded-full bg-muted">
                            <PackageOpen className="size-6 text-muted-foreground/60" />
                        </span>
                        <p className="text-sm font-medium text-foreground">
                            {hasFilter ? "没有匹配的商品" : "暂无商品"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                            {hasFilter ? "试试调整关键词或状态筛选" : "还没有商品数据"}
                        </p>
                        {hasFilter ? (
                            <Button
                                variant="outline"
                                size="sm"
                                className="mt-1 h-8 rounded-lg text-xs"
                                onClick={resetFilters}
                            >
                                <RotateCcw className="size-3.5" />
                                重置筛选
                            </Button>
                        ) : (
                            <Button
                                variant="outline"
                                size="sm"
                                className="mt-1 h-8 rounded-lg text-xs"
                                onClick={() => toast.info("新增商品待接入")}
                            >
                                <Plus className="size-3.5" />
                                新增商品
                            </Button>
                        )}
                    </div>
                ) : (
                    // 切页/刷新时保留旧列表（轻微降透明度表示正在更新）
                    <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
                        {list.map((item) => (
                            <ProductRow key={item.id} item={item} />
                        ))}
                    </div>
                )}
            </div>

            {/* 分页：固定在卡片底部，不随列表滚动 */}
            <div className="flex shrink-0 items-center justify-between gap-3 border-t bg-muted/40 px-4 py-2.5 text-xs text-muted-foreground">
                <span>
                    共 <span className="font-medium tabular-nums text-foreground">{total}</span> 条 · 第 {currentPage}/
                    {totalPages} 页
                </span>
                <PaginationControls
                    page={currentPage}
                    totalPages={totalPages}
                    onPageChange={(next) => setPage(next)}
                    disabled={loading || Boolean(error)}
                />
            </div>
        </div>
    );
}
