"use client";

/**
 * 文档系列：统计磁贴 + 关键词筛选 + 表格外壳 + 分页。
 * 本轮只做「读」：首屏 / 关键词 / 分页都会真实请求列表；增删改与工具栏按钮仍为占位 toast。
 *
 * ==== 接口情况 ====
 * - 远端资源 `/doc-series`：swagger 里有 `/doc-series`、`/doc-series/{id}`、`/doc-series/{id}/articles`；
 *   线上探活未登录返回 401（= 路径存在，只是需要登录）。
 * - 同源代理 `/api/admin/doc-series`（本地未登录返回 401，见 src/app/api/admin/doc-series/route.ts）。
 * - 列表响应：`{ list, total, page, pageSize }`（⚠️ 是 `pageSize`，不是打赏那种 `page_size`）；
 *   列表查询参数 `keyword` / `page` / `pageSize`（请求参数同样是驼峰 `pageSize`）。
 * - 写接口：POST `/doc-series`、PUT `/doc-series/{id}`、DELETE `/doc-series/{id}`；
 *   「管理文档」对应 `/doc-series/{id}/articles` —— 本轮全部不接，保持 toast 占位。
 *
 * 类型 DocSeries / 查询参数 AdminDocSeriesListParams 统一从 `@/types/doc-series` 引入，
 * 组件内不再重复声明。
 *
 * 页面结构遵循后台列表页统一外壳：admin-card 内只有 admin-scroll 一个直系滚动子元素，
 * 且三种状态（加载 / 空 / 错误）都渲染在同一个 admin-scroll 里 —— 外壳在任何状态下都只有
 * 一个 .admin-scroll 与一个 .admin-sticky-head。
 */

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
    BookMarked,
    FileText,
    Layers,
    Library,
    ListOrdered,
    Loader2,
    Pencil,
    Plus,
    RefreshCw,
    RotateCcw,
    Search,
    Trash2,
    X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PaginationControls } from "@/components/pagination-controls";
import { getAdminDocSeriesApi } from "@/lib/api";
import { ACTION_TONE } from "@/lib/action-tones";
import { resolveAssetUrl } from "@/lib/utils";
import type { DocSeries } from "@/types/doc-series";

/** 每页条数（⚠️ 请求参数名是驼峰 pageSize） */
const PAGE_SIZE = 10;

/** 时间戳（YYYY-MM-DD HH:MM，本地时区） */
function formatDateTime(iso?: string): string {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 未就绪（加载中 / 出错）时的数值占位 */
const PLACEHOLDER = "—";

/** 统计磁贴（后三项按「当前页」口径聚合，接口只给分页列表） */
const STAT_TILES = [
    {
        key: "total",
        label: "系列总数",
        icon: Library,
        chip: "bg-primary/10 text-primary",
    },
    {
        key: "docs",
        label: "收录文档",
        icon: FileText,
        chip: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
    },
    {
        key: "sorted",
        label: "已排序",
        icon: ListOrdered,
        chip: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    },
    {
        key: "empty",
        label: "空系列",
        icon: BookMarked,
        chip: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    },
] as const;

// 移动端(<640px)：grid-cols-1 把每个单元格竖排成卡片；≥640px：恢复表格式列布局。
// min-w 只写在 sm: 以上 —— 窄屏若也撑宽，卡片就会被拉出横向滚动。
// 表头与数据行共用这套列宽，列顺序：系列 / 简介 / 文档数 / 排序 / 创建时间 / 操作
const rowGrid = "sm:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_72px_64px_150px_128px]";
const rowMinW = "sm:min-w-[1000px]";

/** 单行模板：字段与 DocSeries 一一对应 */
function DocSeriesRow({ item }: { item: DocSeries }) {
    return (
        <div
            className={`grid grid-cols-1 items-center gap-x-3 gap-y-2 border-b px-4 py-3 text-sm transition-colors last:border-b-0 hover:bg-muted/40 sm:gap-y-1 ${rowMinW} ${rowGrid}`}
        >
            {/* 系列：封面 cover_url + 名称 name，下方补一行更新时间 */}
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
                        <BookMarked className="size-4 text-muted-foreground/50" />
                    )}
                </div>
                <div className="min-w-0">
                    <div className="truncate font-medium text-foreground">{item.name || PLACEHOLDER}</div>
                    <div className="truncate text-xs text-muted-foreground">
                        更新 {formatDateTime(item.updated_at)}
                    </div>
                </div>
            </div>
            {/* 简介：description（后端多为单行文案，按 2 行截断） */}
            <div className="min-w-0 text-xs text-muted-foreground">
                <span className="mr-1 sm:hidden">简介</span>
                <span className="line-clamp-2">{item.description || PLACEHOLDER}</span>
            </div>
            {/* 文档数：doc_count */}
            <div className="sm:text-center">
                <span className="inline-block rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
                    <span className="mr-1 sm:hidden">文档数</span>
                    {item.doc_count ?? 0}
                </span>
            </div>
            {/* 排序：sort */}
            <div className="text-xs tabular-nums text-muted-foreground sm:text-center">
                {/* 裸数字脱离表头看不懂，窄屏补个前缀 */}
                <span className="mr-1 sm:hidden">排序</span>
                {item.sort ?? 0}
            </div>
            {/* 创建时间：created_at */}
            <div className="text-xs text-muted-foreground">
                <span className="mr-1 sm:hidden">创建</span>
                {formatDateTime(item.created_at)}
            </div>
            {/* 操作列：编辑 / 管理文档 / 删除，全部占位 */}
            <div className="flex items-center gap-1 sm:justify-end">
                <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="编辑"
                    title="编辑"
                    className={ACTION_TONE.edit}
                    onClick={() => toast.info("编辑系列待接入")}
                >
                    <Pencil className="size-4" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="管理文档"
                    title="管理系列文档"
                    className={ACTION_TONE.view}
                    onClick={() => toast.info("管理系列文档待接入")}
                >
                    <Layers className="size-4" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="删除"
                    title="删除"
                    className={ACTION_TONE.delete}
                    onClick={() => toast.info("删除系列待接入")}
                >
                    <Trash2 className="size-4" />
                </Button>
            </div>
        </div>
    );
}

/** 加载骨架：与数据行共用同一套列宽，避免加载完成时列宽跳动 */
function DocSeriesSkeleton() {
    return (
        <div aria-busy="true" aria-label="加载中">
            {Array.from({ length: 5 }).map((_, i) => (
                <div
                    key={i}
                    className={`grid grid-cols-1 items-center gap-x-3 gap-y-2 border-b px-4 py-3 sm:gap-y-1 ${rowMinW} ${rowGrid}`}
                >
                    <div className="flex items-center gap-3">
                        <div className="size-9 shrink-0 animate-pulse rounded-lg bg-muted" />
                        <div className="h-3 w-28 animate-pulse rounded bg-muted" />
                    </div>
                    <div className="h-3 w-full animate-pulse rounded bg-muted" />
                    <div className="h-3 w-10 animate-pulse rounded bg-muted sm:mx-auto" />
                    <div className="h-3 w-6 animate-pulse rounded bg-muted sm:mx-auto" />
                    <div className="h-3 w-24 animate-pulse rounded bg-muted" />
                    <div className="h-6 w-24 animate-pulse rounded bg-muted sm:ml-auto" />
                </div>
            ))}
        </div>
    );
}

/**
 * 文档系列页外壳：统计磁贴 + 关键词筛选 + 表格 + 分页。
 * 读接口已接入（首屏 / 关键词 / 分页 / 重试），所有写操作按钮保持 toast 占位。
 */
export function DocSeriesManager() {
    /** 列表数据（远端 /doc-series） */
    const [list, setList] = useState<DocSeries[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    /** 每页条数：接口参数名是驼峰 pageSize，本轮固定 10 条 */
    const [pageSize] = useState(PAGE_SIZE);
    const [loading, setLoading] = useState(true);
    /** 错误信息：非空时列表区显示可重试的错误态 */
    const [error, setError] = useState<string | null>(null);
    /** 输入框里的关键词 */
    const [keyword, setKeyword] = useState("");
    /** 已提交给接口的关键词（回车 / 清空时同步） */
    const [appliedKeyword, setAppliedKeyword] = useState("");
    /** 重试计数：变化即重新拉取 */
    const [refreshKey, setRefreshKey] = useState(0);

    // 拉取列表（浏览器自动携带登录 cookie）。延后到下一个 tick 再 setLoading，
    // 避免在 effect 内同步 setState 触发级联渲染（react-hooks/set-state-in-effect）。
    useEffect(() => {
        let cancelled = false;
        const timer = setTimeout(() => setLoading(true), 0);
        getAdminDocSeriesApi({
            page,
            pageSize,
            keyword: appliedKeyword || undefined,
        })
            .then((data) => {
                if (cancelled) return;
                setList(data?.list ?? []);
                setTotal(data?.total ?? 0);
                setError(null);
            })
            .catch((e) => {
                if (cancelled) return;
                const msg = e instanceof Error ? e.message : "文档系列列表加载失败";
                // 出错时清空列表：让错误态独占列表区，不残留上一次的数据
                setList([]);
                setTotal(0);
                setError(msg);
                // toast 只提示，页面本身留在可重试的错误态（不白屏）
                toast.error(msg);
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
    }, [page, pageSize, appliedKeyword, refreshKey]);

    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    /** 磁贴数值：加载中 / 出错时用占位符，避免显示误导性的 0 */
    const statsReady = !loading && !error;
    const stats = {
        total,
        docs: list.reduce((n, it) => n + (it.doc_count ?? 0), 0),
        sorted: list.filter((it) => (it.sort ?? 0) > 0).length,
        empty: list.filter((it) => (it.doc_count ?? 0) === 0).length,
    };

    /** 提交关键词筛选：回到第一页并带上 keyword 重新请求 */
    const submitSearch = () => {
        setPage(1);
        setAppliedKeyword(keyword.trim());
    };

    /** 清空关键词（输入框右侧 ×）：输入与已提交条件一起清掉 */
    const clearKeyword = () => {
        setKeyword("");
        setAppliedKeyword("");
        setPage(1);
    };

    /** 重试：错误态 / 手动重拉都靠这个计数触发 effect */
    const retry = () => setRefreshKey((k) => k + 1);

    return (
        // admin-card：吃掉剩余高度，列表区域（admin-scroll）在卡片内部滚动，不再顶高整页
        <div className="admin-card">
            {/* 统计磁贴：固定在卡片顶部（shrink-0），不随列表滚动 */}
            <div className="grid shrink-0 grid-cols-2 gap-2 border-b p-3 md:grid-cols-4">
                {STAT_TILES.map((tile) => (
                    <div key={tile.key} className="flex items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2">
                        <span
                            className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${tile.chip}`}
                        >
                            <tile.icon className="size-4" />
                        </span>
                        <div className="min-w-0">
                            <p className="truncate text-xs text-muted-foreground">{tile.label}</p>
                            <p
                                className={`text-lg font-semibold tabular-nums ${statsReady ? "text-foreground" : "text-muted-foreground"}`}
                            >
                                {statsReady ? stats[tile.key] : PLACEHOLDER}
                            </p>
                        </div>
                    </div>
                ))}
            </div>

            {/* 工具栏：固定在卡片顶部（shrink-0），不随下方列表滚动。
                左：关键词 + 重置；右：新增系列 / 刷新（按钮仍为占位） */}
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-muted/40 px-4 py-2.5">
                <div className="flex flex-1 flex-wrap items-center gap-2">
                    <div className="relative w-56">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={keyword}
                            onChange={(e) => setKeyword(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") submitSearch();
                            }}
                            placeholder="搜索系列名称 / 简介"
                            className="h-8 pl-8 pr-8 text-xs"
                            aria-label="搜索文档系列"
                        />
                        {keyword && (
                            <button
                                type="button"
                                onClick={clearKeyword}
                                aria-label="清空搜索"
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>

                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() => toast.info("重置筛选待接入")}
                    >
                        <RotateCcw className="size-3.5" />
                        重置
                    </Button>

                    <span className="text-xs text-muted-foreground">
                        共 <span className="font-medium text-foreground">{total}</span> 个系列
                    </span>
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        size="sm"
                        className="h-8 bg-primary text-primary-foreground hover:bg-primary/90"
                        onClick={() => toast.info("新增系列待接入")}
                    >
                        <Plus className="size-3.5" />
                        新增系列
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() => toast.info("刷新待接入")}
                    >
                        <RefreshCw className="size-3.5" />
                        刷新
                    </Button>
                </div>
            </div>

            {/* 列表：卡片内唯一滚动区（表头吸顶），工具栏与分页都不动。
                加载 / 空 / 错误三态都渲染在这个 admin-scroll 里，外壳保持不变 */}
            <div className="admin-scroll">
                {/* 表头：移动端隐藏（卡片自带行内信息即可读懂），≥sm 才以 grid 显示 */}
                <div
                    className={`admin-sticky-head hidden items-center gap-3 border-b px-4 py-2.5 text-xs font-medium text-muted-foreground sm:grid ${rowMinW} ${rowGrid}`}
                >
                    <span>系列</span>
                    <span>简介</span>
                    <span className="text-center">文档数</span>
                    <span className="text-center">排序</span>
                    <span>创建时间</span>
                    <span className="text-right">操作</span>
                </div>

                {loading ? (
                    <DocSeriesSkeleton />
                ) : error ? (
                    // 错误态：给消息 + 重试（toast 已提示过，这里保证页面不白屏、可自救）
                    <div className="flex min-h-64 flex-col items-center justify-center gap-2 px-4 py-12 text-center">
                        <span className="flex size-12 items-center justify-center rounded-full border bg-destructive/10">
                            <BookMarked className="size-5 text-destructive" />
                        </span>
                        <p className="text-sm font-medium text-destructive">文档系列加载失败</p>
                        <p className="max-w-md text-xs text-muted-foreground">{error}</p>
                        <Button variant="outline" size="sm" className="mt-1 h-8 rounded-lg text-xs" onClick={retry}>
                            <RefreshCw className="size-3.5" />
                            重试
                        </Button>
                    </div>
                ) : list.length === 0 ? (
                    // 空态：区分「筛选没匹配」与「确实没数据」
                    <div className="flex min-h-64 flex-col items-center justify-center gap-2 px-4 py-12 text-center">
                        <span className="flex size-12 items-center justify-center rounded-full border bg-muted/60">
                            <BookMarked className="size-5 text-muted-foreground/60" />
                        </span>
                        <p className="text-sm font-medium text-foreground">
                            {appliedKeyword ? "没有匹配的文档系列" : "暂无文档系列"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                            {appliedKeyword
                                ? `没有找到包含「${appliedKeyword}」的系列，换个关键词试试`
                                : "接口还没有返回任何系列，可稍后重试"}
                        </p>
                        {appliedKeyword ? (
                            <Button
                                variant="outline"
                                size="sm"
                                className="mt-1 h-8 rounded-lg text-xs"
                                onClick={clearKeyword}
                            >
                                <X className="size-3.5" />
                                清空筛选
                            </Button>
                        ) : (
                            <Button
                                variant="outline"
                                size="sm"
                                className="mt-1 h-8 rounded-lg text-xs"
                                onClick={() => toast.info("新增系列待接入")}
                            >
                                <Plus className="size-3.5" />
                                新增系列
                            </Button>
                        )}
                    </div>
                ) : (
                    list.map((item) => <DocSeriesRow key={item.id} item={item} />)
                )}

                {/* 加载提示：骨架之外再给一行文字 + spinner，明确「正在请求」 */}
                {loading && (
                    <div className="flex items-center justify-center gap-2 px-4 py-3 text-xs text-muted-foreground">
                        <Loader2 className="size-3.5 animate-spin" />
                        加载中…
                    </div>
                )}
            </div>

            {/* 分页：固定在卡片底部，不随列表滚动 */}
            <div className="flex shrink-0 items-center justify-between gap-3 border-t bg-muted/40 px-4 py-2.5 text-xs text-muted-foreground">
                <span>
                    共 {total} 条 · 第 {page}/{totalPages} 页
                </span>
                <PaginationControls
                    page={page}
                    totalPages={totalPages}
                    onPageChange={setPage}
                    disabled={loading || !!error}
                />
            </div>
        </div>
    );
}
