"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
    Eraser,
    ExternalLink,
    Eye,
    Loader2,
    Pencil,
    RefreshCw,
    RotateCcw,
    Rss,
    Search,
    Trash2,
    X,
    Zap,
} from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { PaginationControls } from "@/components/pagination-controls";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    MOMENT_DEFAULT_SORT_BY,
    MOMENT_DEFAULT_SORT_ORDER,
    MOMENT_SORT_OPTIONS,
    MOMENT_SORT_ORDER_OPTIONS,
    batchDeleteAdminMomentsApi,
    clearAdminMomentsCacheApi,
    deleteAdminMomentApi,
    getAdminMomentDetailApi,
    getAdminMomentsApi,
    getAdminMomentsFetchStatusApi,
    triggerAdminMomentsFetchApi,
    updateAdminMomentApi,
} from "@/lib/api";
import type {
    AdminMomentItem,
    AdminMomentUpdatePayload,
    MomentFetchStatus,
    MomentSortBy,
    MomentSortOrder,
    MomentsStatistics,
} from "@/types/moments";
import { cn } from "@/lib/utils";
import { ACTION_TONE } from "@/lib/action-tones";

const PAGE_SIZE_OPTIONS = [10, 20, 50];
const DEFAULT_PAGE_SIZE = 10;

/** 列表行栅格（桌面端）：选择 / 文章 / 友链 / 作者 / 发布时间 / 抓取时间 / 操作 */
const ROW_GRID =
    "sm:grid-cols-[28px_minmax(0,1fr)_190px_100px_130px_130px_96px]";

/** 时间字符串 → 两行展示（日期 / 时分） */
function TimeCell({ value }: { value?: string }) {
    const d = value ? new Date(value) : null;
    if (!d || Number.isNaN(d.getTime())) return <span className="text-xs text-muted-foreground">—</span>;
    const p = (n: number) => String(n).padStart(2, "0");
    return (
        <span className="flex flex-col gap-0.5 text-xs text-muted-foreground">
            <span className="tabular-nums">
                {`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`}
            </span>
            <span className="tabular-nums opacity-70">{`${p(d.getHours())}:${p(d.getMinutes())}`}</span>
        </span>
    );
}

/** ISO/RFC3339 → datetime-local（本地时间，YYYY-MM-DDTHH:MM） */
function isoToDatetimeLocal(iso?: string): string {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** datetime-local（本地时间）→ RFC3339；空值返回 undefined（表示不改这一项） */
function datetimeLocalToRfc3339(value: string): string | undefined {
    const text = value.trim();
    if (!text) return undefined;
    const d = new Date(text);
    if (Number.isNaN(d.getTime())) return undefined;
    return d.toISOString();
}

/**
 * 朋友圈管理（对齐官方后台 /admin/moments）：
 * 列表来自远端 GET /pro/admin/moments（经同源代理 /api/admin/moments，需管理员），
 * 支持关键词搜索、按友链 ID 筛选、五种字段排序，可触发 RSS 抓取 / 清理缓存 / 查看 / 编辑 / 删除 / 批量删除。
 * 说明：朋友圈数据由 RSS 抓取产生，后台不提供"新建"，所以这里没有新增入口。
 */
export function MomentManager() {
    const [moments, setMoments] = useState<AdminMomentItem[]>([]);
    const [total, setTotal] = useState(0);
    const [statistics, setStatistics] = useState<MomentsStatistics | undefined>(undefined);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);

    // 筛选条件：输入态（输入框）与已应用态（请求参数）分开，点「查询」才生效
    const [keywordInput, setKeywordInput] = useState("");
    const [keyword, setKeyword] = useState("");
    const [linkIdInput, setLinkIdInput] = useState("");
    const [linkId, setLinkId] = useState(0);
    const [sortBy, setSortBy] = useState<MomentSortBy>(MOMENT_DEFAULT_SORT_BY);
    const [sortOrder, setSortOrder] = useState<MomentSortOrder>(MOMENT_DEFAULT_SORT_ORDER);

    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [fetchStatus, setFetchStatus] = useState<MomentFetchStatus | null>(null);
    const [busy, setBusy] = useState<"" | "fetch" | "clear" | "batch" | "delete">("");
    const [editing, setEditing] = useState<AdminMomentItem | null>(null);
    const [viewing, setViewing] = useState<AdminMomentItem | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await getAdminMomentsApi({
                page,
                page_size: pageSize,
                keyword: keyword || undefined,
                link_id: linkId || undefined,
                sort_by: sortBy,
                sort_order: sortOrder,
            });
            setMoments(data.list ?? []);
            setTotal(data.total ?? 0);
            setStatistics(data.statistics);
        } catch (e) {
            setError(e instanceof Error ? e.message : "朋友圈列表加载失败");
            setMoments([]);
            setTotal(0);
        } finally {
            setLoading(false);
        }
    }, [page, pageSize, keyword, linkId, sortBy, sortOrder]);

    useEffect(() => {
        // 延后到下一个 tick：effect 内同步 setState 会触发级联渲染（react-hooks/set-state-in-effect）
        const timer = setTimeout(() => void load(), 0);
        return () => clearTimeout(timer);
    }, [load, refreshKey]);

    /** 拉取 RSS 抓取状态（失败静默：不影响列表） */
    const loadStatus = useCallback(async () => {
        try {
            setFetchStatus(await getAdminMomentsFetchStatusApi());
        } catch {
            setFetchStatus(null);
        }
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => void loadStatus(), 0);
        return () => clearTimeout(timer);
    }, [loadStatus]);

    // 抓取中：每 3s 轮询一次（官方同款间隔）
    useEffect(() => {
        if (!fetchStatus?.is_fetching) return;
        const timer = setInterval(() => void loadStatus(), 3000);
        return () => clearInterval(timer);
    }, [fetchStatus?.is_fetching, loadStatus]);

    // 抓取由「进行中」变为「结束」时，自动刷新列表
    const prevFetching = useRef<boolean | null>(null);
    useEffect(() => {
        const nowFetching = Boolean(fetchStatus?.is_fetching);
        const prev = prevFetching.current;
        prevFetching.current = nowFetching;
        if (prev === true && !nowFetching) {
            const timer = setTimeout(() => {
                setRefreshKey((k) => k + 1);
                toast.success("RSS 抓取已完成");
            }, 0);
            return () => clearTimeout(timer);
        }
    }, [fetchStatus?.is_fetching]);

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const reload = () => setRefreshKey((k) => k + 1);
    const clearSelection = () => setSelected(new Set());
    const hasFilter = Boolean(keyword || linkId > 0);

    const submitFilters = () => {
        const parsed = Number(linkIdInput.trim());
        setLinkId(Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0);
        setKeyword(keywordInput.trim());
        setPage(1);
        clearSelection();
    };

    const resetFilters = () => {
        setKeywordInput("");
        setKeyword("");
        setLinkIdInput("");
        setLinkId(0);
        setSortBy(MOMENT_DEFAULT_SORT_BY);
        setSortOrder(MOMENT_DEFAULT_SORT_ORDER);
        setPage(1);
        clearSelection();
    };

    const toggleOne = (id: number, checked: boolean) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (checked) next.add(id);
            else next.delete(id);
            return next;
        });
    };

    const allSelected = moments.length > 0 && moments.every((m) => selected.has(m.id));
    const someSelected = selected.size > 0;

    const toggleAll = (checked: boolean) => {
        setSelected(checked ? new Set(moments.map((m) => m.id)) : new Set());
    };

    const handleTriggerFetch = async () => {
        setBusy("fetch");
        try {
            await triggerAdminMomentsFetchApi();
            toast.success("已触发 RSS 抓取", { description: "后台处理中，完成后会自动刷新列表" });
            await loadStatus();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "触发抓取失败");
        } finally {
            setBusy("");
        }
    };

    const handleClearCache = async () => {
        if (!window.confirm("清理朋友圈缓存？会清掉聚合结果的缓存（不影响已入库的数据）。")) return;
        setBusy("clear");
        try {
            await clearAdminMomentsCacheApi();
            toast.success("缓存已清理");
            reload();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "清理缓存失败");
        } finally {
            setBusy("");
        }
    };

    const handleDelete = async (item: AdminMomentItem) => {
        if (!window.confirm(`确定删除「${item.post_title || item.post_url}」这条朋友圈数据吗？`)) return;
        setBusy("delete");
        try {
            await deleteAdminMomentApi(item.id);
            toast.success("已删除");
            clearSelection();
            reload();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "删除失败");
        } finally {
            setBusy("");
        }
    };

    const handleBatchDelete = async () => {
        const ids = [...selected];
        if (ids.length === 0) return;
        if (!window.confirm(`确定删除选中的 ${ids.length} 条朋友圈数据吗？此操作不可撤销。`)) return;
        setBusy("batch");
        try {
            await batchDeleteAdminMomentsApi(ids);
            toast.success(`已删除 ${ids.length} 条`);
            clearSelection();
            reload();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "批量删除失败");
        } finally {
            setBusy("");
        }
    };

    return (
        // admin-card：吃掉剩余高度，列表区域（admin-scroll）在卡片内部滚动，不再顶高整页
        <div className="admin-card">
            {/* 统计 / 抓取状态、工具栏、批量操作条：固定在卡片顶部（shrink-0），不随列表滚动 */}
            <div className="shrink-0 space-y-3 border-b p-3">
                {/* ===== 统计 / 抓取状态 ===== */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
                    <span>
                        共 <span className="font-medium text-foreground">{total}</span> 条
                    </span>
                    <span>友链 {statistics?.total_links ?? 0}</span>
                    <span>活跃 {statistics?.active_links ?? 0}</span>
                    {statistics?.last_updated_time && <span>更新 {statistics.last_updated_time}</span>}
                    {fetchStatus?.status && (
                        <Badge
                            variant="outline"
                            className={cn(
                                "text-[10px] font-medium",
                                fetchStatus.is_fetching
                                    ? "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                                    : "border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400"
                            )}
                        >
                            {fetchStatus.is_fetching ? "抓取中…" : fetchStatus.status}
                        </Badge>
                    )}
                </div>

                {/* ===== 工具栏 ===== */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="relative">
                            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                value={keywordInput}
                                onChange={(e) => setKeywordInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") submitFilters();
                                }}
                                placeholder="搜索标题 / 摘要…"
                                className="h-9 w-44 pl-8 text-xs sm:w-56"
                            />
                        </div>
                        <Input
                            value={linkIdInput}
                            onChange={(e) => setLinkIdInput(e.target.value.replace(/[^\d]/g, ""))}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") submitFilters();
                            }}
                            inputMode="numeric"
                            placeholder="友链 ID"
                            aria-label="按友链 ID 筛选"
                            className="h-9 w-24 text-xs tabular-nums"
                        />
                        <Button variant="outline" size="sm" className="h-9 rounded-xl text-xs" onClick={submitFilters}>
                            查询
                        </Button>
                        {hasFilter && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-9 rounded-xl text-xs"
                                onClick={resetFilters}
                            >
                                <RotateCcw className="size-3.5" />
                                重置
                            </Button>
                        )}
                        <Select
                            value={sortBy}
                            onValueChange={(v) => {
                                setSortBy(v as MomentSortBy);
                                setPage(1);
                            }}
                        >
                            <SelectTrigger className="h-9 w-32 rounded-xl text-xs" aria-label="排序字段">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {MOMENT_SORT_OPTIONS.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                        {option.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select
                            value={sortOrder}
                            onValueChange={(v) => {
                                setSortOrder(v as MomentSortOrder);
                                setPage(1);
                            }}
                        >
                            <SelectTrigger className="h-9 w-24 rounded-xl text-xs" aria-label="排序方向">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {MOMENT_SORT_ORDER_OPTIONS.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                        {option.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Button
                            variant="outline"
                            size="icon-sm"
                            aria-label="刷新"
                            title="刷新列表"
                            className="size-9 rounded-xl"
                            disabled={loading}
                            onClick={() => void load()}
                        >
                            <RefreshCw className={cn("size-4", loading && "animate-spin")} />
                        </Button>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <Button
                            size="sm"
                            className="h-9 rounded-xl text-xs"
                            disabled={busy !== ""}
                            onClick={() => void handleTriggerFetch()}
                        >
                            {busy === "fetch" ? <Loader2 className="size-3.5 animate-spin" /> : <Zap className="size-3.5" />}
                            抓取
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-9 rounded-xl text-xs"
                            disabled={busy !== ""}
                            onClick={() => void handleClearCache()}
                        >
                            {busy === "clear" ? <Loader2 className="size-3.5 animate-spin" /> : <Eraser className="size-3.5" />}
                            清理缓存
                        </Button>
                    </div>
                </div>

                {/* ===== 批量操作条 ===== */}
                {someSelected && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-2 text-xs">
                        <span>
                            已选 <span className="font-medium text-foreground">{selected.size}</span> 条
                        </span>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 rounded-lg text-xs"
                                onClick={clearSelection}
                            >
                                取消选择
                            </Button>
                            <Button
                                variant="destructive"
                                size="sm"
                                className="h-8 rounded-lg text-xs"
                                disabled={busy !== ""}
                                onClick={() => void handleBatchDelete()}
                            >
                                {busy === "batch" ? (
                                    <Loader2 className="size-3.5 animate-spin" />
                                ) : (
                                    <Trash2 className="size-3.5" />
                                )}
                                批量删除
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            {/* ===== 列表 =====（卡片内唯一滚动区：只有列表在这里滚动，表头吸顶） */}
            <div className="admin-scroll">
                {loading ? (
                    <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground">
                        <Loader2 className="mr-2 size-4 animate-spin" />
                        加载中…
                    </div>
                ) : error ? (
                    <div className="flex min-h-64 flex-col items-center justify-center gap-2 text-sm">
                        <p className="text-destructive">{error}</p>
                        <Button variant="outline" size="sm" onClick={() => void load()}>
                            重试
                        </Button>
                    </div>
                ) : moments.length === 0 ? (
                    <div className="flex min-h-64 flex-col items-center justify-center gap-1 text-sm text-muted-foreground">
                        <Rss className="size-8 opacity-40" />
                        <span>{hasFilter ? "没有匹配的朋友圈数据" : "暂无朋友圈数据"}</span>
                        <span className="text-xs opacity-70">
                            {hasFilter ? "试试调整筛选条件" : "触发 RSS 抓取后将在这里显示聚合文章"}
                        </span>
                    </div>
                ) : (
                    <>
                        <div
                            className={cn(
                                "admin-sticky-head hidden min-w-[900px] items-center gap-3 border-b px-4 py-2.5 text-xs font-medium text-muted-foreground sm:grid",
                                ROW_GRID
                            )}
                        >
                            <Checkbox
                                checked={allSelected ? true : someSelected ? "indeterminate" : false}
                                onCheckedChange={(v) => toggleAll(v === true)}
                                aria-label="全选当前页"
                            />
                            <span>文章</span>
                            <span>友链</span>
                            <span>作者</span>
                            <span>发布时间</span>
                            <span>抓取时间</span>
                            <span className="text-right">操作</span>
                        </div>
                        <div className="sm:min-w-[900px]">
                            {moments.map((item) => (
                                <div
                                    key={item.id}
                                    className={cn(
                                        "grid grid-cols-1 items-center gap-x-3 gap-y-2 border-b px-4 py-3 text-sm transition-colors last:border-b-0 hover:bg-muted/40 sm:gap-y-1",
                                        ROW_GRID
                                    )}
                                >
                                    <span className="flex items-center gap-2">
                                        <Checkbox
                                            checked={selected.has(item.id)}
                                            onCheckedChange={(v) => toggleOne(item.id, v === true)}
                                            aria-label={`选择 ${item.post_title || item.id}`}
                                        />
                                        <span className="text-xs text-muted-foreground tabular-nums sm:hidden">
                                            #{item.id}
                                        </span>
                                    </span>

                                    <div className="min-w-0">
                                        <div className="flex items-center gap-1.5">
                                            <span className="truncate font-medium" title={item.post_title}>
                                                {item.post_title || "（无标题）"}
                                            </span>
                                            {item.post_url && (
                                                <a
                                                    href={item.post_url}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    title="打开原文"
                                                    aria-label="打开原文"
                                                    className="shrink-0 text-muted-foreground transition-colors hover:text-primary"
                                                >
                                                    <ExternalLink className="size-3.5" />
                                                </a>
                                            )}
                                        </div>
                                        <p
                                            className="mt-0.5 truncate text-xs text-muted-foreground"
                                            title={item.post_summary || item.post_url}
                                        >
                                            {item.post_summary || item.post_url}
                                        </p>
                                    </div>

                                    <div className="flex min-w-0 items-center gap-2">
                                        <Avatar size="sm">
                                            {item.link_logo ? (
                                                <AvatarImage src={item.link_logo} alt={item.link_name || "友链头像"} />
                                            ) : null}
                                            <AvatarFallback>{(item.link_name || "友").slice(0, 1)}</AvatarFallback>
                                        </Avatar>
                                        <div className="min-w-0">
                                            <div className="truncate text-xs" title={item.link_name}>
                                                {item.link_name || "—"}
                                            </div>
                                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                                <span className="shrink-0 tabular-nums">#{item.link_id}</span>
                                                {item.link_url && (
                                                    <a
                                                        href={item.link_url}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        title={item.link_url}
                                                        className="truncate transition-colors hover:text-primary"
                                                    >
                                                        {item.link_url}
                                                    </a>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <span className="truncate text-xs text-muted-foreground" title={item.author}>
                                        {item.author || "—"}
                                    </span>

                                    <TimeCell value={item.published_at} />
                                    <TimeCell value={item.fetched_at} />

                                    <span className="flex justify-end gap-1">
                                        <Button
                                            variant="ghost"
                                            size="icon-sm"
                                            aria-label="查看"
                                            title="查看详情"
                                            className={ACTION_TONE.view}
                                            onClick={() => setViewing(item)}
                                        >
                                            <Eye className="size-3.5" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon-sm"
                                            aria-label="编辑"
                                            title="编辑"
                                            className={ACTION_TONE.edit}
                                            onClick={() => setEditing(item)}
                                        >
                                            <Pencil className="size-3.5" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon-sm"
                                            aria-label="删除"
                                            title="删除"
                                            className={ACTION_TONE.delete}
                                            disabled={busy !== ""}
                                            onClick={() => void handleDelete(item)}
                                        >
                                            <Trash2 className="size-3.5" />
                                        </Button>
                                    </span>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>

            {/* ===== 分页 =====（固定在卡片底部，不随列表滚动） */}
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t p-3 text-xs text-muted-foreground">
                <span>
                    共 <span className="font-medium text-foreground">{total}</span> 条 · 第 {page} / {totalPages} 页
                </span>
                <div className="flex items-center gap-2">
                    <Select
                        value={String(pageSize)}
                        onValueChange={(v) => {
                            setPageSize(Number(v));
                            setPage(1);
                            clearSelection();
                        }}
                    >
                        <SelectTrigger className="h-8 w-24 rounded-lg text-xs" aria-label="每页条数">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {PAGE_SIZE_OPTIONS.map((size) => (
                                <SelectItem key={size} value={String(size)}>
                                    {size} 条/页
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <PaginationControls
                        page={page}
                        totalPages={totalPages}
                        disabled={loading}
                        onPageChange={(p) => {
                            setPage(p);
                            clearSelection();
                        }}
                    />
                </div>
            </div>

            {viewing && <MomentDetailDialog moment={viewing} onClose={() => setViewing(null)} />}
            {editing && (
                <MomentEditorDialog
                    moment={editing}
                    busy={busy !== ""}
                    onClose={() => setEditing(null)}
                    onSaved={() => {
                        setEditing(null);
                        reload();
                    }}
                />
            )}
        </div>
    );
}

/** 只读信息行（详情弹窗 / 编辑弹窗底部的系统字段） */
function InfoField({ label, value }: { label: string; value: string }) {
    return (
        <div className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
            <div className="truncate rounded-lg border border-input bg-muted/40 px-3 py-1.5 text-xs" title={value}>
                {value || "—"}
            </div>
        </div>
    );
}

/** 查看详情弹窗（打开时按官方做法拉一次 GET /pro/admin/moments/{id}） */
function MomentDetailDialog({ moment, onClose }: { moment: AdminMomentItem; onClose: () => void }) {
    const [detail, setDetail] = useState<AdminMomentItem>(moment);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        const timer = setTimeout(() => {
            void (async () => {
                try {
                    const data = await getAdminMomentDetailApi(moment.id);
                    if (!cancelled && data) setDetail(data);
                } catch {
                    // 详情拉取失败时退回列表里的数据
                } finally {
                    if (!cancelled) setLoading(false);
                }
            })();
        }, 0);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [moment.id]);

    const time = (value?: string) => isoToDatetimeLocal(value).replace("T", " ") || "—";

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
            <div
                className="flex max-h-[88vh] w-full max-w-2xl flex-col rounded-xl border bg-card p-5 shadow-xl"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="mb-4 flex items-center justify-between gap-2">
                    <h3 className="truncate text-base font-semibold" title={detail.post_title}>
                        朋友圈数据 #{detail.id}
                        {loading && <Loader2 className="ml-2 inline size-3.5 animate-spin text-muted-foreground" />}
                    </h3>
                    <button
                        type="button"
                        aria-label="关闭"
                        onClick={onClose}
                        className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                        <X className="size-4" />
                    </button>
                </div>

                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                    <div>
                        <span className="mb-1 block text-xs font-medium text-muted-foreground">文章标题</span>
                        <div className="flex items-start gap-1.5 text-sm">
                            <span className="min-w-0 break-words">{detail.post_title || "（无标题）"}</span>
                            {detail.post_url && (
                                <a
                                    href={detail.post_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="shrink-0 text-muted-foreground transition-colors hover:text-primary"
                                    aria-label="打开原文"
                                >
                                    <ExternalLink className="size-3.5" />
                                </a>
                            )}
                        </div>
                    </div>

                    <div>
                        <span className="mb-1 block text-xs font-medium text-muted-foreground">文章摘要</span>
                        <p className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-input bg-muted/40 px-3 py-2 text-xs">
                            {detail.post_summary || "—"}
                        </p>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <InfoField label="作者" value={detail.author || "—"} />
                        <InfoField label="友链名称" value={detail.link_name || `#${detail.link_id}`} />
                        <InfoField label="友链 ID" value={String(detail.link_id)} />
                        <InfoField label="RSS GUID" value={detail.guid || "—"} />
                        <InfoField label="发布时间" value={time(detail.published_at)} />
                        <InfoField label="抓取时间" value={time(detail.fetched_at)} />
                        <InfoField label="创建时间" value={time(detail.created_at)} />
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <InfoField label="文章链接" value={detail.post_url || "—"} />
                        <InfoField label="友链地址" value={detail.link_url || "—"} />
                        <InfoField label="友链头像" value={detail.link_logo || "—"} />
                    </div>
                </div>

                <div className="mt-4 flex justify-end">
                    <Button size="sm" onClick={onClose}>
                        关闭
                    </Button>
                </div>
            </div>
        </div>
    );
}

/** 编辑弹窗（对齐官方字段：标题/链接必填，发布时间用 datetime-local） */
function MomentEditorDialog({
    moment,
    busy,
    onClose,
    onSaved,
}: {
    moment: AdminMomentItem;
    busy: boolean;
    onClose: () => void;
    onSaved: () => void;
}) {
    const [form, setForm] = useState({
        post_title: moment.post_title ?? "",
        post_url: moment.post_url ?? "",
        post_summary: moment.post_summary ?? "",
        author: moment.author ?? "",
        link_name: moment.link_name ?? "",
        link_url: moment.link_url ?? "",
        link_logo: moment.link_logo ?? "",
        published_at: isoToDatetimeLocal(moment.published_at),
    });
    const [saving, setSaving] = useState(false);

    const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
        setForm((prev) => ({ ...prev, [key]: value }));

    const save = async () => {
        if (!form.post_title.trim()) {
            toast.warning("文章标题不能为空");
            return;
        }
        if (!form.post_url.trim()) {
            toast.warning("文章链接不能为空");
            return;
        }
        const payload: AdminMomentUpdatePayload = {
            post_title: form.post_title.trim(),
            post_url: form.post_url.trim(),
            post_summary: form.post_summary,
            author: form.author.trim(),
            link_name: form.link_name.trim(),
            link_url: form.link_url.trim(),
            link_logo: form.link_logo.trim(),
        };
        const publishedAt = datetimeLocalToRfc3339(form.published_at);
        if (publishedAt) payload.published_at = publishedAt;

        setSaving(true);
        try {
            await updateAdminMomentApi(moment.id, payload);
            toast.success("已保存");
            onSaved();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "保存失败");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
            <div
                className="flex max-h-[88vh] w-full max-w-3xl flex-col rounded-xl border bg-card p-5 shadow-xl"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="mb-4 flex items-center justify-between gap-2">
                    <h3 className="text-base font-semibold">编辑朋友圈数据 #{moment.id}</h3>
                    <button
                        type="button"
                        aria-label="关闭"
                        onClick={onClose}
                        className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                        <X className="size-4" />
                    </button>
                </div>

                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <label className="block">
                            <span className="mb-1 block text-xs font-medium text-muted-foreground">
                                文章标题（必填）
                            </span>
                            <Input value={form.post_title} onChange={(e) => set("post_title", e.target.value)} />
                        </label>
                        <label className="block">
                            <span className="mb-1 block text-xs font-medium text-muted-foreground">
                                文章链接（必填）
                            </span>
                            <Input
                                value={form.post_url}
                                onChange={(e) => set("post_url", e.target.value)}
                                className="font-mono text-xs"
                            />
                        </label>
                        <label className="block">
                            <span className="mb-1 block text-xs font-medium text-muted-foreground">作者</span>
                            <Input value={form.author} onChange={(e) => set("author", e.target.value)} />
                        </label>
                        <label className="block">
                            <span className="mb-1 block text-xs font-medium text-muted-foreground">
                                发布时间（本地时间）
                            </span>
                            <Input
                                type="datetime-local"
                                value={form.published_at}
                                onChange={(e) => set("published_at", e.target.value)}
                                className="text-xs"
                            />
                        </label>
                    </div>

                    <label className="block">
                        <span className="mb-1 block text-xs font-medium text-muted-foreground">文章摘要</span>
                        <textarea
                            value={form.post_summary}
                            onChange={(e) => set("post_summary", e.target.value)}
                            rows={4}
                            className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                        />
                    </label>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <label className="block">
                            <span className="mb-1 block text-xs font-medium text-muted-foreground">友链名称</span>
                            <Input value={form.link_name} onChange={(e) => set("link_name", e.target.value)} />
                        </label>
                        <label className="block">
                            <span className="mb-1 block text-xs font-medium text-muted-foreground">友链地址</span>
                            <Input
                                value={form.link_url}
                                onChange={(e) => set("link_url", e.target.value)}
                                className="font-mono text-xs"
                            />
                        </label>
                        <label className="block">
                            <span className="mb-1 block text-xs font-medium text-muted-foreground">友链头像</span>
                            <Input
                                value={form.link_logo}
                                onChange={(e) => set("link_logo", e.target.value)}
                                className="font-mono text-xs"
                            />
                        </label>
                    </div>

                    <div className="grid grid-cols-1 gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-2 lg:grid-cols-4">
                        <InfoField label="友链 ID" value={String(moment.link_id)} />
                        <InfoField label="RSS GUID" value={moment.guid || "—"} />
                        <InfoField
                            label="抓取时间"
                            value={isoToDatetimeLocal(moment.fetched_at).replace("T", " ") || "—"}
                        />
                        <InfoField
                            label="创建时间"
                            value={isoToDatetimeLocal(moment.created_at).replace("T", " ") || "—"}
                        />
                    </div>
                </div>

                <div className="mt-4 flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={onClose}>
                        取消
                    </Button>
                    <Button size="sm" disabled={busy || saving} onClick={() => void save()}>
                        {saving ? "保存中…" : "保存"}
                    </Button>
                </div>
            </div>
        </div>
    );
}
