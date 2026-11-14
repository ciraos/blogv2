"use client";

/**
 * 文档系列：统计磁贴 + 关键词筛选 + 表格外壳 + 分页 + 增 / 改 / 删 + 「管理系列文章」。
 *
 * ==== 接口情况 ====
 * - 列表 / 新建：GET、POST `/doc-series`（远端 router.go:334-341；同源代理见
 *   src/app/api/admin/doc-series/route.ts）。
 * - 更新 / 删除：PUT、DELETE `/doc-series/{id}`（同源代理 .../doc-series/[id]/route.ts）。
 *   远端会拒绝删除仍有文档的系列（pkg/service/doc_series/service.go:134-143），
 *   这里按 doc_count 先给一次同口径的提示，避免白跑一次请求。
 * - 系列文章：GET `/public/doc-series/{id}/articles`（router.go:330；同源代理
 *   .../doc-series/[id]/articles/route.ts）—— 只返回**已发布且 is_doc** 的文章。
 *   加入 / 移出没有专用接口，改走文章编辑接口 PUT `/articles/{id}` 的
 *   is_doc / doc_series_id 字段（详见 src/lib/api-doc-series-write.ts 顶部注释）。
 * - 列表响应：`{ list, total, page, pageSize }`（⚠️ 是 `pageSize`，不是打赏那种 `page_size`）；
 *   列表查询参数 `keyword` / `page` / `pageSize`（⚠️ 社区版后端只读 page / pageSize，
 *   keyword 会被忽略，见 src/app/api/admin/doc-series/route.ts 注释）。
 *
 * 类型 DocSeries / 查询参数 AdminDocSeriesListParams 统一从 `@/types/doc-series` 引入，
 * 写操作与系列文章相关类型从 `@/lib/api-doc-series-write` 引入，组件内不重复声明。
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
    MinusCircle,
    Pencil,
    Plus,
    PlusCircle,
    RefreshCw,
    Search,
    Trash2,
    X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatStrip } from "@/components/admin/stat-strip";
import { AdminFilterBar } from "@/components/admin/filter-bar";
import { AdminEmptyState } from "@/components/admin/empty-state";
import { useConfirm } from "@/components/confirm-provider";
import { Input } from "@/components/ui/input";
import { PaginationControls } from "@/components/pagination-controls";
import { getAdminArticlesApi, getAdminDocSeriesApi } from "@/lib/api";
import {
    addArticleToDocSeriesApi,
    createAdminDocSeriesApi,
    deleteAdminDocSeriesApi,
    getAdminDocSeriesArticlesApi,
    removeArticleFromDocSeriesApi,
    updateAdminDocSeriesApi,
} from "@/lib/api-doc-series-write";
import type { DocSeriesWithArticles } from "@/lib/api-doc-series-write";
import { ACTION_TONE } from "@/lib/action-tones";
import { resolveAssetUrl } from "@/lib/utils";
import type { PostItem } from "@/types/articles";
import type { DocSeries } from "@/types/doc-series";

/** 每页条数（⚠️ 请求参数名是驼峰 pageSize） */
const PAGE_SIZE = 10;

/** 「添加文章」候选列表每页条数（远端 /articles 分页参数同样是驼峰 pageSize） */
const CANDIDATE_PAGE_SIZE = 10;

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

// 任何宽度都用同一套列模板：窄屏靠 .admin-scroll 横向滚动、操作列 sticky 固定，不再折成卡片。
// 窄屏也保持 min-w：整张表横向滚动，列不会被压扁。
// 表头与数据行共用这套列宽，列顺序：系列 / 简介 / 文档数 / 排序 / 创建时间 / 操作
const rowGrid = "grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_72px_64px_150px_128px]";
const rowMinW = "min-w-[1000px]";

/** 单行模板：字段与 DocSeries 一一对应 */
function DocSeriesRow({
    item,
    busy,
    onEdit,
    onManage,
    onDelete,
}: {
    item: DocSeries;
    busy: boolean;
    onEdit: (item: DocSeries) => void;
    onManage: (item: DocSeries) => void;
    onDelete: (item: DocSeries) => void;
}) {
    return (
        <div
            className={`grid admin-list-row items-center gap-x-3 gap-y-2 border-b px-4 py-3 text-sm transition-colors last:border-b-0 hover:bg-muted/40 sm:gap-y-1 ${rowMinW} ${rowGrid}`}
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
                <span className="line-clamp-2">{item.description || PLACEHOLDER}</span>
            </div>
            {/* 文档数：doc_count */}
            <div className="sm:text-center">
                <span className="inline-block rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
                    {item.doc_count ?? 0}
                </span>
            </div>
            {/* 排序：sort */}
            <div className="text-xs tabular-nums text-muted-foreground sm:text-center">
                {/* 裸数字脱离表头看不懂，窄屏补个前缀 */}
                {item.sort ?? 0}
            </div>
            {/* 创建时间：created_at */}
            <div className="text-xs text-muted-foreground">
                {formatDateTime(item.created_at)}
            </div>
            {/* 操作列：编辑 / 管理文档 / 删除（统一 h-8 的 icon 尺寸） */}
            <div className="flex items-center gap-1 sm:justify-end">
                <Button
                    variant="ghost"
                    size="icon"
                    aria-label="编辑"
                    title="编辑"
                    className={ACTION_TONE.edit}
                    disabled={busy}
                    onClick={() => onEdit(item)}
                >
                    <Pencil className="size-4" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    aria-label="管理文档"
                    title="管理系列文章"
                    className={ACTION_TONE.view}
                    disabled={busy}
                    onClick={() => onManage(item)}
                >
                    <Layers className="size-4" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    aria-label="删除"
                    title="删除"
                    className={ACTION_TONE.delete}
                    disabled={busy}
                    onClick={() => onDelete(item)}
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
                    className={`grid admin-list-row items-center gap-x-3 gap-y-2 border-b px-4 py-3 sm:gap-y-1 ${rowMinW} ${rowGrid}`}
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
 * 文档系列页外壳：统计磁贴 + 关键词筛选 + 表格 + 分页 + 增删改。
 * 列表读接口 + 写接口（新建 / 编辑 / 删除）与「管理系列文章」都已接入；
 * ⚠️ 三个写接口本轮**未在线上实测**（线上只做 GET 探测）。
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
    /** 写操作进行中（按钮统一禁用，避免重复提交） */
    const [busy, setBusy] = useState(false);
    /** 新增 / 编辑弹窗：open + 被编辑的系列（null = 新增） */
    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState<DocSeries | null>(null);
    /** 「管理系列文章」弹窗目标系列 */
    const [articlesSeries, setArticlesSeries] = useState<DocSeries | null>(null);

    // 应用内确认弹窗（替代 window.confirm，见 components/confirm-provider.tsx）
    const confirm = useConfirm();

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

    /** 新增系列：清空编辑目标后开弹窗 */
    const openCreate = () => {
        setEditing(null);
        setFormOpen(true);
    };

    /** 编辑系列：带上当前行数据回填弹窗 */
    const openEdit = (item: DocSeries) => {
        setEditing(item);
        setFormOpen(true);
    };

    /**
     * 删除系列：二次确认后才发请求。
     * 先按 doc_count 拦一次 —— 远端对非空系列也是直接拒绝
     * （service.go:134-143），本地提示能省一次必然失败的往返。
     */
    const handleDelete = async (item: DocSeries) => {
        const docCount = item.doc_count ?? 0;
        if (docCount > 0) {
            toast.warning(`该系列下还有 ${docCount} 篇文档，请先在「管理系列文章」里移出后再删除`);
            return;
        }
        if (!(await confirm({ title: `确定删除系列「${item.name}」吗？`, description: "此操作不可撤销。", danger: true }))) return;
        setBusy(true);
        deleteAdminDocSeriesApi(item.id)
            .then(() => {
                toast.success("系列已删除");
                retry();
            })
            .catch((e) => toast.error(e instanceof Error ? e.message : "删除失败"))
            .finally(() => setBusy(false));
    };

    return (
        // admin-card：吃掉剩余高度，列表区域（admin-scroll）在卡片内部滚动，不再顶高整页
        <div className="admin-card">
            {/* 统计：读数条（共用 StatStrip），原来每个数字外套一层描边卡片 + 彩色图标块 */}
            <StatStrip
                items={STAT_TILES.map((tile) => ({
                    label: tile.label,
                    value: statsReady ? stats[tile.key] : PLACEHOLDER,
                }))}
            />

            {/* 工具栏：统一工具条，固定在卡片顶部（shrink-0），不随下方列表滚动 */}
            <AdminFilterBar
                search={{
                    value: keyword,
                    onChange: setKeyword,
                    placeholder: "搜索系列名称 / 简介",
                    ariaLabel: "搜索文档系列",
                    onSubmit: submitSearch,
                }}
                onReset={clearKeyword}
                resetDisabled={!keyword}
                summary={
                    <>
                        共 <span className="font-medium text-foreground">{total}</span> 个系列
                    </>
                }
            >
                <div className="col-span-2 order-last flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
                    <Button
                        size="sm"
                        className="h-8 shrink-0 bg-primary text-primary-foreground hover:bg-primary/90"
                        disabled={busy}
                        onClick={openCreate}
                    >
                        <Plus className="size-3.5" />
                        <span className="hidden sm:inline">新增系列</span>
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 shrink-0"
                        disabled={loading}
                        onClick={retry}
                    >
                        <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
                        <span className="hidden sm:inline">刷新</span>
                    </Button>
                </div>
            </AdminFilterBar>

            {/* 列表：卡片内唯一滚动区（表头吸顶），工具栏与分页都不动。
                加载 / 空 / 错误三态都渲染在这个 admin-scroll 里，外壳保持不变 */}
            <div className="admin-scroll">
                {/* 表头：任何宽度都显示（窄屏横向滚动时需要列名） */}
                <div
                    className={`admin-sticky-head admin-list-head items-center gap-3 border-b px-4 py-2 text-xs font-medium text-muted-foreground grid ${rowMinW} ${rowGrid}`}
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
                    <div className="flex min-h-64 flex-col items-center justify-center gap-2 px-4 py-8 text-center">
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
                    <AdminEmptyState
                        kind="articles"
                        filtered={Boolean(appliedKeyword)}
                        title={appliedKeyword ? undefined : "还没有文档系列"}
                        description={
                            appliedKeyword
                                ? `没有找到包含「${appliedKeyword}」的系列，换个关键词试试`
                                : "把同一主题的文档归到一个系列里，前台会按系列成组展示"
                        }
                        action={
                            appliedKeyword ? (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 text-xs"
                                    onClick={clearKeyword}
                                >
                                    <X className="size-3.5" />
                                    清空筛选
                                </Button>
                            ) : (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 text-xs"
                                    disabled={busy}
                                    onClick={openCreate}
                                >
                                    <Plus className="size-3.5" />
                                    新增系列
                                </Button>
                            )
                        }
                    />
                ) : (
                    list.map((item) => (
                        <DocSeriesRow
                            key={item.id}
                            item={item}
                            busy={busy}
                            onEdit={openEdit}
                            onManage={setArticlesSeries}
                            onDelete={handleDelete}
                        />
                    ))
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

            {/* ===== 新增 / 编辑系列 ===== */}
            {formOpen && (
                <DocSeriesFormDialog
                    series={editing}
                    busy={busy}
                    setBusy={setBusy}
                    onClose={() => setFormOpen(false)}
                    onSaved={() => {
                        setFormOpen(false);
                        retry();
                    }}
                />
            )}

            {/* ===== 管理系列文章 ===== */}
            {articlesSeries && (
                <DocSeriesArticlesDialog
                    series={articlesSeries}
                    onClose={() => {
                        setArticlesSeries(null);
                        // 系列文章变动会同步改 doc_count，关掉弹窗后刷新列表
                        retry();
                    }}
                />
            )}
        </div>
    );
}

/**
 * 新增 / 编辑系列弹窗：字段对齐官方 DocSeriesFormModal.tsx:93-126
 * （系列名称必填、描述、封面图 URL、排序，数值越小越靠前）。
 */
function DocSeriesFormDialog({
    series,
    busy,
    setBusy,
    onClose,
    onSaved,
}: {
    series: DocSeries | null;
    busy: boolean;
    setBusy: (v: boolean) => void;
    onClose: () => void;
    onSaved: () => void;
}) {
    const isEdit = series !== null;
    const [form, setForm] = useState({
        name: series?.name ?? "",
        description: series?.description ?? "",
        coverUrl: series?.cover_url ?? "",
        sort: String(series?.sort ?? 0),
    });

    const save = async () => {
        if (!form.name.trim()) {
            toast.error("请输入系列名称");
            return;
        }
        setBusy(true);
        try {
            const body = {
                name: form.name.trim(),
                description: form.description.trim(),
                cover_url: form.coverUrl.trim(),
                sort: Number(form.sort) || 0,
            };
            if (isEdit) {
                await updateAdminDocSeriesApi(series.id, body);
                toast.success("系列已保存");
            } else {
                await createAdminDocSeriesApi(body);
                toast.success("系列已创建");
            }
            onSaved();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "保存失败");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
            <div
                className="flex max-h-[88vh] w-full max-w-xl flex-col soft-surface p-4 shadow-xl"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="mb-3 flex items-center justify-between gap-2">
                    <h3 className="text-base font-semibold">{isEdit ? "编辑文档系列" : "新增文档系列"}</h3>
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
                    <label className="block">
                        <span className="mb-1 block text-xs font-medium text-muted-foreground">系列名称（必填）</span>
                        <Input
                            value={form.name}
                            maxLength={50}
                            placeholder="请输入系列名称"
                            onChange={(e) => setForm({ ...form, name: e.target.value })}
                        />
                    </label>
                    <label className="block">
                        <span className="mb-1 block text-xs font-medium text-muted-foreground">描述</span>
                        <textarea
                            value={form.description}
                            maxLength={200}
                            rows={3}
                            placeholder="请输入系列描述（可选）"
                            onChange={(e) => setForm({ ...form, description: e.target.value })}
                            className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                        />
                    </label>
                    <label className="block">
                        <span className="mb-1 block text-xs font-medium text-muted-foreground">封面图 URL</span>
                        <Input
                            value={form.coverUrl}
                            placeholder="请输入封面图片地址（可选）"
                            onChange={(e) => setForm({ ...form, coverUrl: e.target.value })}
                        />
                    </label>
                    {form.coverUrl.trim() && (
                        <div className="flex items-center gap-3 rounded-lg border p-2">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={resolveAssetUrl(form.coverUrl.trim()) ?? form.coverUrl.trim()}
                                alt="封面预览"
                                className="size-16 shrink-0 rounded-md border object-cover"
                            />
                            <p className="min-w-0 truncate text-xs text-muted-foreground">{form.coverUrl.trim()}</p>
                        </div>
                    )}
                    <label className="block">
                        <span className="mb-1 block text-xs font-medium text-muted-foreground">排序</span>
                        <Input
                            type="number"
                            value={form.sort}
                            placeholder="数值越小越靠前"
                            onChange={(e) => setForm({ ...form, sort: e.target.value })}
                        />
                        <span className="mt-1 block text-xs text-muted-foreground">数值越小越靠前，默认为 0</span>
                    </label>
                </div>

                <div className="mt-3 flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={onClose}>
                        取消
                    </Button>
                    <Button size="sm" disabled={busy} onClick={() => void save()}>
                        {busy ? "保存中…" : isEdit ? "保存修改" : "创建系列"}
                    </Button>
                </div>
            </div>
        </div>
    );
}

/**
 * 「管理系列文章」弹窗：
 *  - 上半：该系列当前收录的文章（远端只回已发布 + is_doc 的文章），可「移出」；
 *  - 下半：候选文章（远端 /articles 分页列表），可搜索、可「加入本系列」。
 * 加入 / 移出都会改文章数据（PUT /articles/{id}），所以都先过二次确认。
 */
function DocSeriesArticlesDialog({ series, onClose }: { series: DocSeries; onClose: () => void }) {
    /** 系列详情 + 名下文章 */
    const [data, setData] = useState<DocSeriesWithArticles | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    /** 候选文章（远端 /articles 分页列表） */
    const [candidates, setCandidates] = useState<PostItem[]>([]);
    const [candidateLoading, setCandidateLoading] = useState(true);
    const [searchInput, setSearchInput] = useState("");
    const [appliedSearch, setAppliedSearch] = useState("");
    /** 正在加入 / 移出的文章 id（按钮级禁用） */
    const [pendingId, setPendingId] = useState<string | null>(null);
    /** 变动后重新拉取 */
    const [refreshKey, setRefreshKey] = useState(0);

    // 拉系列文章（延后一个 tick setState，避免 effect 内同步 setState 的级联渲染告警）
    useEffect(() => {
        let cancelled = false;
        const timer = setTimeout(() => setLoading(true), 0);
        getAdminDocSeriesArticlesApi(series.id)
            .then((res) => {
                if (cancelled) return;
                setData(res);
                setError(null);
            })
            .catch((e) => {
                if (cancelled) return;
                setData(null);
                setError(e instanceof Error ? e.message : "系列文章加载失败");
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
    }, [series.id, refreshKey]);

    // 拉候选文章列表（关键词 + 分页）
    useEffect(() => {
        let cancelled = false;
        const timer = setTimeout(() => setCandidateLoading(true), 0);
        getAdminArticlesApi({ page: 1, pageSize: CANDIDATE_PAGE_SIZE, keyword: appliedSearch || undefined })
            .then((res) => {
                if (cancelled) return;
                setCandidates(res?.list ?? []);
            })
            .catch((e) => {
                if (cancelled) return;
                setCandidates([]);
                toast.error(e instanceof Error ? e.message : "文章列表加载失败");
            })
            .finally(() => {
                if (!cancelled) {
                    clearTimeout(timer);
                    setCandidateLoading(false);
                }
            });
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [appliedSearch, refreshKey]);

    const reload = () => setRefreshKey((k) => k + 1);

    // 应用内确认弹窗（替代 window.confirm，见 components/confirm-provider.tsx）
    const confirm = useConfirm();

    const articles = data?.articles ?? [];
    const inSeries = new Set(articles.map((a) => a.id));

    /** 加入系列：二次确认 → PUT /articles/{id} { is_doc: true, doc_series_id } */
    const addArticle = async (article: PostItem) => {
        if (
            !(await confirm({
                title: `确定把「${article.title || article.id}」加入系列「${series.name}」吗？`,
                description: "该文章会被标记为文档并归入本系列；草稿状态的文章不会出现在系列列表里。",
            }))
        ) {
            return;
        }
        setPendingId(article.id);
        addArticleToDocSeriesApi(article.id, series.id)
            .then(() => {
                toast.success("已加入本系列");
                reload();
            })
            .catch((e) => toast.error(e instanceof Error ? e.message : "加入失败"))
            .finally(() => setPendingId(null));
    };

    /** 移出系列：二次确认 → PUT /articles/{id} { doc_series_id: "" } */
    const removeArticle = async (articleId: string, title: string) => {
        if (!(await confirm({ title: `确定把「${title || articleId}」移出系列「${series.name}」吗？` }))) return;
        setPendingId(articleId);
        removeArticleFromDocSeriesApi(articleId)
            .then(() => {
                toast.success("已移出本系列");
                reload();
            })
            .catch((e) => toast.error(e instanceof Error ? e.message : "移出失败"))
            .finally(() => setPendingId(null));
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
            <div
                className="flex max-h-[88vh] w-full max-w-3xl flex-col soft-surface p-4 shadow-xl"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="mb-1 flex items-center justify-between gap-2">
                    <h3 className="text-base font-semibold">管理系列文章</h3>
                    <button
                        type="button"
                        aria-label="关闭"
                        onClick={onClose}
                        className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                        <X className="size-4" />
                    </button>
                </div>
                <p className="mb-3 text-xs text-muted-foreground">
                    系列「{series.name}」· 当前收录{" "}
                    <span className="font-medium text-foreground">{data?.doc_count ?? series.doc_count ?? 0}</span> 篇
                    （列表只显示已发布且标记为文档的文章）
                </p>

                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                    {/* ===== 本系列的文章 ===== */}
                    <section className="rounded-lg border">
                        <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-4 py-2">
                            <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                                <Layers className="size-3.5" />
                                本系列文章
                            </span>
                            <span className="text-xs text-muted-foreground">共 {articles.length} 篇</span>
                        </div>
                        {loading ? (
                            <div className="flex items-center justify-center gap-2 px-4 py-8 text-xs text-muted-foreground">
                                <Loader2 className="size-3.5 animate-spin" />
                                加载中…
                            </div>
                        ) : error ? (
                            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                                <p className="text-xs text-destructive">{error}</p>
                                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={reload}>
                                    重试
                                </Button>
                            </div>
                        ) : articles.length === 0 ? (
                            <p className="px-4 py-8 text-center text-xs text-muted-foreground">
                                该系列下还没有文章，可从下方列表加入
                            </p>
                        ) : (
                            // 密集列表：容器 divide-y，行内不再各套一层边框
                            <div className="divide-y">
                                {articles.map((a) => (
                                    <div
                                        key={a.id}
                                        className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-muted/40"
                                    >
                                        <div className="min-w-0">
                                            <p className="truncate font-medium text-foreground">{a.title || a.id}</p>
                                            <p className="truncate text-xs text-muted-foreground">
                                                排序 {a.doc_sort ?? 0} · 创建 {formatDateTime(a.created_at)}
                                                {a.abbrlink ? ` · ${a.abbrlink}` : ""}
                                            </p>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className={`h-8 shrink-0 text-xs ${ACTION_TONE.delete}`}
                                            disabled={pendingId === a.id}
                                            onClick={() => removeArticle(a.id, a.title)}
                                        >
                                            <MinusCircle className="size-3.5" />
                                            移出
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>

                    {/* ===== 候选文章 ===== */}
                    <section className="rounded-lg border">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-4 py-2">
                            <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                                <PlusCircle className="size-3.5" />
                                添加文章
                            </span>
                            <div className="relative w-56">
                                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    value={searchInput}
                                    onChange={(e) => setSearchInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") setAppliedSearch(searchInput.trim());
                                    }}
                                    placeholder="搜索文章标题后回车"
                                    className="h-8 pl-8 text-xs"
                                    aria-label="搜索待加入的文章"
                                />
                            </div>
                        </div>
                        {candidateLoading ? (
                            <div className="flex items-center justify-center gap-2 px-4 py-8 text-xs text-muted-foreground">
                                <Loader2 className="size-3.5 animate-spin" />
                                加载中…
                            </div>
                        ) : candidates.length === 0 ? (
                            <p className="px-4 py-8 text-center text-xs text-muted-foreground">没有匹配的文章</p>
                        ) : (
                            <div className="divide-y">
                                {candidates.map((item) => {
                                    const already = inSeries.has(item.id);
                                    return (
                                        <div
                                            key={item.id}
                                            className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-muted/40"
                                        >
                                            <div className="min-w-0">
                                                <p className="truncate font-medium text-foreground">
                                                    {item.title || item.id}
                                                </p>
                                                <p className="truncate text-xs text-muted-foreground">
                                                    {item.status} · 创建 {formatDateTime(item.created_at)}
                                                </p>
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className={`h-8 shrink-0 text-xs ${ACTION_TONE.approve}`}
                                                disabled={already || pendingId === item.id}
                                                title={already ? "已在本系列中" : "加入本系列"}
                                                onClick={() => addArticle(item)}
                                            >
                                                <PlusCircle className="size-3.5" />
                                                {already ? "已加入" : "加入"}
                                            </Button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </section>
                </div>

                <div className="mt-3 flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={onClose}>
                        关闭
                    </Button>
                </div>
            </div>
        </div>
    );
}
