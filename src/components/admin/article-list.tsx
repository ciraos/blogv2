"use client";

import { useCallback, useEffect, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import {
    Check,
    Eye,
    FolderTree,
    FolderOutputIcon,
    Pencil,
    Plus,
    Trash2,
    Upload,
    X,
} from "lucide-react";
import { toast } from "sonner";
import { AdminFilterBar } from "@/components/admin/filter-bar";
import { AdminEmptyState } from "@/components/admin/empty-state";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/confirm-provider";
import { Checkbox } from "@/components/ui/checkbox";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { PaginationControls } from "@/components/pagination-controls";
import { ACTION_TONE } from "@/lib/action-tones";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

import { deleteAdminArticleApi, getAdminArticleCategoriesApi, getAdminArticlesApi, getAdminArticleTagsApi } from "@/lib/api";
import {
    batchDeleteAdminArticlesChunked,
    createAdminArticleCategoryApi,
    createAdminArticleTagApi,
    deleteAdminArticleCategoryApi,
    deleteAdminArticleTagApi,
    exportAdminArticlesApi,
    updateAdminArticleCategoryApi,
    updateAdminArticleTagApi,
    type PostCategoryIO,
    type PostTagIO,
} from "@/lib/api-articles-io";
import { ArticleImportDialog } from "@/components/admin/article-import-dialog";
import type { PostCategory, PostItem, PostTag } from "@/types/articles";

const PAGE_SIZE = 20;

/** 一次最多导出多少篇（与代理路由的 EXPORT_MAX_IDS 保持一致） */
const EXPORT_MAX_IDS = 1000;

/** 导出「全部筛选结果」时，一页最多拉 100 条（后端 List 的 pageSize 上限） */
const FETCH_ALL_PAGE_SIZE = 100;

/** 拉全部筛选结果时的分页上限，防后端不认 pageSize 时无限循环 */
const MAX_FETCH_PAGES = 50;

const STATUS_LABEL: Record<string, string> = {
    PUBLISHED: "已发布",
    DRAFT: "草稿",
    ARCHIVED: "已归档",
    SCHEDULED: "定时发布",
};

const STATUS_CLASS: Record<string, string> = {
    PUBLISHED: "bg-emerald-500",
    DRAFT: "bg-amber-500",
    ARCHIVED: "bg-slate-400",
    SCHEDULED: "bg-sky-500",
};

// 状态筛选选项（「定时发布」后端枚举值待确认，暂用 SCHEDULED）
const STATUS_OPTIONS = [
    { value: "PUBLISHED", label: "已发布" },
    { value: "DRAFT", label: "草稿" },
    { value: "ARCHIVED", label: "已归档" },
    { value: "SCHEDULED", label: "定时发布" },
];

// 审核状态筛选选项（字段名 review_status、枚举待确认）
const REVIEW_OPTIONS = [
    { value: "PENDING", label: "待审核" },
    { value: "APPROVED", label: "已通过" },
    { value: "REJECTED", label: "已拒绝" },
];

function formatDate(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
}

/** 触发浏览器下载一个 Blob（导出 zip 用；Object URL 用完即释放） */
function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

/** /admin/post-management 文章列表：过滤（状态/审核/分类/标签）+ 搜索 + 分页 + 导入导出 + 多选批量删除 */
export function ArticleList() {
    const [list, setList] = useState<PostItem[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [keyword, setKeyword] = useState("");
    const [input, setInput] = useState("");
    const [status, setStatus] = useState("");
    const [review, setReview] = useState("");
    const [category, setCategory] = useState("");
    const [tag, setTag] = useState("");
    const [categories, setCategories] = useState<PostCategory[]>([]);
    const [tags, setTags] = useState<PostTag[]>([]);
    const [catsLoading, setCatsLoading] = useState(true);
    const [tagsLoading, setTagsLoading] = useState(true);
    /** 删除成功后用自增 key 触发列表重拉 */
    const [refreshKey, setRefreshKey] = useState(0);
    /** 正在删除的文章 id（防重复点击） */
    const [deletingId, setDeletingId] = useState<PostItem["id"] | null>(null);
    /** 勾选的文章 id（支持跨页累积） */
    const [selected, setSelected] = useState<string[]>([]);
    /** 批量删除进行中 */
    const [batchBusy, setBatchBusy] = useState(false);
    /** 导出进行中 */
    const [exportBusy, setExportBusy] = useState(false);
    /** 导入弹窗 / 分类标签弹窗 */
    const [importOpen, setImportOpen] = useState(false);
    const [taxonomyOpen, setTaxonomyOpen] = useState(false);

    // 应用内确认弹窗（替代 window.confirm，见 components/confirm-provider.tsx）
    const confirm = useConfirm();

    const visibleIds = list.map((a) => a.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id));
    const someSelected = visibleIds.some((id) => selected.includes(id));

    // 分类/标签下拉数据（挂载时加载一次；分类标签弹窗里改完会用 refreshKey 重新拉）
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const [cs, ts] = await Promise.all([
                    getAdminArticleCategoriesApi(),
                    getAdminArticleTagsApi(),
                ]);
                if (!cancelled) {
                    setCategories(cs);
                    setTags(ts);
                }
            } catch {
                // 分类/标签加载失败不阻塞列表
            } finally {
                if (!cancelled) {
                    setCatsLoading(false);
                    setTagsLoading(false);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [refreshKey]);

    // 输入即搜：防抖 300ms，自动回到第 1 页并搜索（无需点搜索按钮）
    useEffect(() => {
        const t = setTimeout(() => {
            setPage(1);
            setKeyword(input.trim());
        }, 300);
        return () => clearTimeout(t);
    }, [input]);

    // 状态/审核/分类/标签发生变化时回到第 1 页（用 setTimeout 规避 React Compiler 的 effect 内 setState 规则）
    useEffect(() => {
        const t = setTimeout(() => setPage(1), 0);
        return () => clearTimeout(t);
    }, [status, review, category, tag]);

    // 分页/筛选条件变化时清空勾选（跨页勾选只在下拉筛选不变的同一批结果里有意义）
    useEffect(() => {
        const t = setTimeout(() => setSelected([]), 0);
        return () => clearTimeout(t);
    }, [page, keyword, status, review, category, tag]);

    // 拉取文章列表（浏览器自动携带登录 cookie）
    useEffect(() => {
        let cancelled = false;
        const timer = setTimeout(() => setLoading(true), 0);
        getAdminArticlesApi({
            page,
            pageSize: PAGE_SIZE,
            keyword: keyword || undefined,
            status: status || undefined,
            review_status: review || undefined,
            category_id: category || undefined,
            tag_id: tag || undefined,
        })
            .then((data) => {
                if (cancelled) return;
                setList(data.list ?? []);
                setTotal(data.total ?? 0);
            })
            .catch(() => {
                if (!cancelled) toast.error("获取文章列表失败");
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
    }, [page, keyword, status, review, category, tag, refreshKey]);

    /** 删除文章：确认 → 调接口 → 重拉列表。删掉当前页最后一条时回退一页，避免停在空页 */
    const handleDelete = async (article: PostItem) => {
        const title = article.title?.trim() || `#${article.id}`;
        if (!(await confirm({ title: `确定删除《${title}》吗？`, description: "删除后不可恢复。", danger: true }))) return;
        setDeletingId(article.id);
        try {
            await deleteAdminArticleApi(article.id);
            toast.success("已删除");
            if (list.length === 1 && page > 1) setPage((prev) => prev - 1);
            else setRefreshKey((prev) => prev + 1);
        } catch (error) {
            // 后端失败原因（如"文章不存在"）优先展示，否则给通用提示
            toast.error(error instanceof Error && error.message ? error.message : "删除失败");
        } finally {
            setDeletingId(null);
        }
    };

    /** 勾选/取消勾选一篇文章 */
    const toggleSelect = (id: string) => {
        setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    };

    /** 只作用于本页可见行（与评论管理的「全选本页」一致） */
    const toggleSelectAllVisible = () => {
        setSelected((prev) =>
            allSelected ? prev.filter((id) => !visibleIds.includes(id)) : [...new Set([...prev, ...visibleIds])]
        );
    };

    /** 批量删除：确认 → 按 100 篇分片调用 → 只把失败的重置为勾选状态，方便重试 */
    const handleBatchDelete = async () => {
        const ids = [...selected];
        if (ids.length === 0) return;
        const first = list.find((a) => a.id === ids[0]);
        const preview = first?.title?.trim() ? `《${first.title.trim()}》${ids.length > 1 ? " 等" : ""}` : "";
        if (
            !(await confirm({
                title: `确定删除选中的 ${ids.length} 篇文章吗？`,
                description: `${preview ? `${preview}\n` : ""}删除后不可恢复。`,
                danger: true,
            }))
        ) {
            return;
        }

        setBatchBusy(true);
        try {
            const res = await batchDeleteAdminArticlesChunked(ids);
            const failedIds = res.failed_ids ?? [];
            setSelected(failedIds);
            if (res.success_count > 0) {
                toast.success(`已删除 ${res.success_count} 篇`);
            }
            if (res.failed_count > 0) {
                toast.error(`有 ${res.failed_count} 篇删除失败，已保留勾选，可重试`);
            }
            // 本页被删空时回退一页（与单篇删除同一处理）
            if (list.length > 0 && res.success_count >= list.length && page > 1) setPage((prev) => prev - 1);
            else setRefreshKey((prev) => prev + 1);
        } catch (error) {
            toast.error(error instanceof Error && error.message ? error.message : "批量删除失败");
        } finally {
            setBatchBusy(false);
        }
    };

    /** 拉取「当前筛选条件下的全部文章 id」（用于没勾选任何行时的整体导出） */
    const fetchFilteredIds = async (): Promise<string[]> => {
        const ids: string[] = [];
        for (let p = 1; p <= MAX_FETCH_PAGES; p += 1) {
            const data = await getAdminArticlesApi({
                page: p,
                pageSize: FETCH_ALL_PAGE_SIZE,
                keyword: keyword || undefined,
                status: status || undefined,
                review_status: review || undefined,
                category_id: category || undefined,
                tag_id: tag || undefined,
            });
            const items = data.list ?? [];
            ids.push(...items.map((a) => a.id));
            // 后端可能把 pageSize 压到上限以下；用「累计数已达 total」或「本页不足一页」双重判断收尾，
            // 同时用返回的 page 字段确认翻页确实生效，避免在同一页上死循环。
            if (ids.length >= (data.total ?? 0) || items.length < FETCH_ALL_PAGE_SIZE) break;
            if (typeof data.page === "number" && data.page < p) break;
        }
        return ids;
    };

    /**
     * 导出：勾选了 → 导出勾选的；没勾选 → 导出当前筛选条件下的全部。
     * 远端返回 zip 文件流（含 Markdown 与 articles.json），代理已透传文件名。
     */
    const handleExport = async () => {
        setExportBusy(true);
        const loadingId = toast.loading("正在准备导出…");
        try {
            const ids = selected.length > 0 ? [...selected] : await fetchFilteredIds();
            if (ids.length === 0) {
                toast.info("没有可导出的文章");
                return;
            }
            if (ids.length > EXPORT_MAX_IDS) {
                toast.error(`一次最多导出 ${EXPORT_MAX_IDS} 篇（当前 ${ids.length} 篇），请先缩小筛选或分批导出`);
                return;
            }

            const { blob, filename } = await exportAdminArticlesApi(ids);
            downloadBlob(blob, filename);
            toast.success(`已导出 ${ids.length} 篇文章`, {
                description: "zip 内含 articles.json 与 markdown/，可直接用于「导入」",
            });
        } catch (e) {
            toast.error(e instanceof Error && e.message ? e.message : "导出失败");
        } finally {
            toast.dismiss(loadingId);
            setExportBusy(false);
        }
    };

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    const goPage = (p: number) => {
        const next = Math.min(totalPages, Math.max(1, p));
        setPage(next);
    };

    // 重置筛选下拉（状态/审核/分类/标签），回到第 1 页
    const resetFilters = () => {
        setStatus("");
        setReview("");
        setCategory("");
        setTag("");
        setPage(1);
    };

    // 任何宽度都用同一套列模板：窄屏靠 .admin-scroll 横向滚动、操作列 sticky 固定，不再折成卡片。
    // 窄屏也保持 min-w：整张表横向滚动，列不会被压扁。
    // 操作列：预览/编辑/删除 三个带文字的按钮（实测各 67.6px）+ 2 个 gap-1（4px）≈ 211px，列宽取 236px，
    // 余量 ≈25px，与改前（272px 装 4 个按钮）一致：去掉历史版本图标按钮后内容少了 32px 按钮 + 4px 间隔 = 36px，
    // 列宽同步收窄 36px，剩余三个按钮的宽度与间距完全不变。
    // 最前面 36px 是批量删除用的勾选列。
    // ⚠️ 窄屏要两套模板：236px 的操作列在 390px 屏上会吃掉六成宽度、标题只剩几十像素，
    //    所以 <640px 把按钮文字藏起来（列宽 120px）、标题列保底 220px；≥sm 恢复带文字的 236px。
    const rowGrid =
        "grid-cols-[36px_minmax(220px,1fr)_96px_80px_96px_120px] sm:grid-cols-[36px_minmax(0,1fr)_96px_80px_96px_236px]";
    // 876px → 840px：只跟着操作列收窄 36px，标题列（minmax(0,1fr)）的最小宽度保持不变
    const rowMinW = "min-w-[840px]";

    // 工具栏右侧的操作按钮（窄屏只留图标）：作为 actions 传给 AdminFilterBar，
    // 桌面端靠右、移动端落在筛选条件之后，顺序才和视觉预期一致
    const toolbarActions = (
                <div className="flex flex-wrap items-center gap-2">
                {/* 批量删除：勾选后才可用，二次确认后按 100 篇分片调用远端 DELETE /articles/batch。
                    没有勾选时保持中性灰 —— 一个常驻的红字按钮在没事的时候也在喊。 */}
                <Button
                    variant="outline"
                    size="sm"
                    className={`h-8 shrink-0 ${selected.length > 0 ? "text-destructive hover:text-destructive" : "text-muted-foreground"}`}
                    disabled={selected.length === 0 || batchBusy}
                    onClick={() => void handleBatchDelete()}
                >
                    <Trash2 size={14} />
                    <span className="hidden sm:inline">
                        {batchBusy ? "删除中…" : `批量删除${selected.length > 0 ? `（${selected.length}）` : ""}`}
                    </span>
                </Button>
                {/* 分类 / 标签管理：POST|PUT|DELETE /api/admin/article-{categories,tags} */}
                <Button variant="outline" size="sm" className="h-8 shrink-0" onClick={() => setTaxonomyOpen(true)}>
                    <FolderTree size={14} />
                    <span className="hidden sm:inline">分类标签</span>
                </Button>
                {/* 新建文章 → /admin/post-management/new */}
                <Button size="sm" className="h-8 shrink-0 bg-primary text-primary-foreground hover:bg-primary/90" asChild>
                    <Link href="/admin/post-management/new">
                        <Plus size={14} />
                        <span className="hidden sm:inline">新增文章</span>
                    </Link>
                </Button>
                {/* 导入：弹窗内选文件 + 二次确认；导入会批量写文章表 */}
                <Button variant="outline" size="sm" className="h-8 shrink-0" onClick={() => setImportOpen(true)}>
                    <Upload size={14} />
                    <span className="hidden sm:inline">导入</span>
                </Button>
                {/* 导出：勾选了就导出勾选的，没勾选就导出当前筛选下的全部（zip 文件流） */}
                <Button
                    variant="outline"
                    size="sm"
                    className="h-8 shrink-0"
                    disabled={exportBusy}
                    title={selected.length > 0 ? `导出已勾选的 ${selected.length} 篇` : "导出当前筛选下的全部文章"}
                    onClick={() => void handleExport()}
                >
                    <FolderOutputIcon size={14} />
                    <span className="hidden sm:inline">
                        {exportBusy ? "导出中…" : "导出"}
                    </span>
                </Button>
            </div>
    );

    return (
        // admin-card：吃掉剩余高度，表格区域（admin-scroll）在卡片内部滚动，不再顶高整页
        <div className="admin-card">
            {/* 工具栏：搜索 + 四个筛选下拉 + 重置 + 右侧按钮（固定在卡片顶部，不随表格滚动） */}
            <AdminFilterBar
                search={{
                    value: input,
                    onChange: setInput,
                    placeholder: "搜索文章标题、内容",
                    ariaLabel: "搜索文章",
                    onSubmit: () => {
                        setPage(1);
                        setKeyword(input.trim());
                    },
                }}
                onReset={resetFilters}
                resetDisabled={!status && !review && !category && !tag}
                summary={`共 ${total} 篇`}
                actions={toolbarActions}
            >

                    {/* 文章状态 */}
                    <Select value={status} onValueChange={setStatus}>
                        <SelectTrigger className="h-8 w-full shrink-0 sm:w-30">
                            <SelectValue placeholder="文章状态" />
                        </SelectTrigger>
                        <SelectContent>
                            {STATUS_OPTIONS.map((o) => (
                                <SelectItem key={o.value} value={o.value}>
                                    {o.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    {/* 审核状态 */}
                    <Select value={review} onValueChange={setReview}>
                        <SelectTrigger className="h-8 w-full shrink-0 sm:w-28">
                            <SelectValue placeholder="审核状态" />
                        </SelectTrigger>
                        <SelectContent>
                            {REVIEW_OPTIONS.map((o) => (
                                <SelectItem key={o.value} value={o.value}>
                                    {o.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    {/* 分类 */}
                    <Select value={category} onValueChange={setCategory}>
                        <SelectTrigger className="h-8 w-full shrink-0 sm:w-26">
                            <SelectValue placeholder="全部分类" />
                        </SelectTrigger>
                        <SelectContent>
                            {catsLoading ? (
                                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                                    加载中…
                                </div>
                            ) : categories.length === 0 ? (
                                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                                    无分类
                                </div>
                            ) : (
                                categories.map((c) => (
                                    <SelectItem key={c.id} value={String(c.id)}>
                                        {c.name}
                                    </SelectItem>
                                ))
                            )}
                        </SelectContent>
                    </Select>

                    {/* 标签 */}
                    <Select value={tag} onValueChange={setTag}>
                        <SelectTrigger className="h-8 w-full shrink-0 sm:w-26">
                            <SelectValue placeholder="全部标签" />
                        </SelectTrigger>
                        <SelectContent>
                            {tagsLoading ? (
                                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                                    加载中…
                                </div>
                            ) : tags.length === 0 ? (
                                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                                    无标签
                                </div>
                            ) : (
                                tags.map((t) => (
                                    <SelectItem key={t.id} value={String(t.id)}>
                                        {t.name}
                                    </SelectItem>
                                ))
                            )}
                        </SelectContent>
                    </Select>

            </AdminFilterBar>

            {/* 列表：移动端(<640px)每个单元格竖排成卡片，≥640px 表格式 grid 并可横向滚动。
                admin-scroll：只有这块纵向滚动（表头吸顶），卡片与工具栏都不动 */}
            <div className="admin-scroll">
                {/* 表头：任何宽度都显示（窄屏横向滚动时需要列名） */}
                <div className={`admin-sticky-head admin-list-head items-center gap-3 border-b px-4 py-2.5 text-xs font-medium text-muted-foreground grid ${rowMinW} ${rowGrid}`}>
                    {/* 全选只作用于本页可见行 */}
                    <Checkbox
                        checked={allSelected ? true : someSelected ? "indeterminate" : false}
                        onCheckedChange={toggleSelectAllVisible}
                        aria-label="全选本页文章"
                    />
                    <span>标题</span>
                    <span>状态</span>
                    <span>统计</span>
                    <span>发布于</span>
                    <span className="text-center">操作</span>
                </div>

                {loading && list.length === 0 ? (
                    <div className="px-4 py-10 text-center text-muted-foreground">加载中…</div>
                ) : list.length === 0 ? (
                    <AdminEmptyState
                        kind="articles"
                        filtered={Boolean(keyword || status || review || category || tag)}
                        action={
                            keyword || status || review || category || tag ? undefined : (
                                <Button variant="outline" size="sm" asChild>
                                    <Link href="/admin/post-management/new">
                                        <Plus size={14} />
                                        写第一篇
                                    </Link>
                                </Button>
                            )
                        }
                    />
                ) : (
                    list.map((article) => (
                        <div
                            key={article.id}
                            className={`grid admin-list-row items-center gap-x-3 gap-y-2 border-b px-4 py-3 text-sm transition-colors last:border-b-0 hover:bg-muted/40 sm:gap-y-1 ${rowMinW} ${rowGrid}`}
                        >
                            {/* 勾选列：窄屏排在卡片最上方 */}
                            <div className="flex items-center">
                                <Checkbox
                                    checked={selected.includes(article.id)}
                                    onCheckedChange={() => toggleSelect(article.id)}
                                    aria-label={`选择《${article.title || article.id}》`}
                                />
                            </div>
                            <div className="flex items-start gap-2">
                                <div className="min-w-0">
                                    <div className="line-clamp-1 font-medium">{article.title}</div>
                                    {/* 分类 / 标签：标题正下方、图标下方，从左到右 */}
                                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                                        {article.post_categories.map((c) => (
                                            <span key={c.id} className="rounded bg-muted px-1.5 py-px text-[11px] text-muted-foreground">
                                                {c.name}
                                            </span>
                                        ))}
                                        {article.post_tags.map((t) => (
                                            <span key={t.id} className="rounded bg-muted px-1.5 py-px text-[11px] text-muted-foreground">
                                                #{t.name}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            {/* 状态：一个小圆点 + 文字。原来是「浅色底 + 同色字」的胶囊，
                                一列下来就是一排彩色标签；状态是元信息，不是奖章。 */}
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <span
                                    className={`size-1.5 shrink-0 rounded-full ${STATUS_CLASS[article.status] || "bg-muted-foreground"}`}
                                    aria-hidden
                                />
                                {STATUS_LABEL[article.status] || article.status}
                            </div>
                            {/* 统计：两个数上下排，等宽对齐、千分位，去掉两个只在解释「这一行是数字」的图标 */}
                            <div className="flex flex-col gap-0.5 text-xs tabular-nums text-muted-foreground">
                                <span>{(article.word_count || 0).toLocaleString("en-US")} 字</span>
                                <span>{(article.view_count || 0).toLocaleString("en-US")} 阅读</span>
                            </div>
                            <div className="text-xs text-muted-foreground">{formatDate(article.created_at)}</div>
                            {/* 操作列：窄屏只留图标（列宽 120px，见 rowGrid 的说明），≥sm 带文字 */}
                            <div className="flex items-center gap-1 sm:justify-center">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    aria-label="预览"
                                    title="预览"
                                    className={ACTION_TONE.view}
                                    asChild
                                >
                                    <Link href={`/posts/${article.abbrlink || article.id}`}>
                                        <Eye className="size-4" />
                                        <span className="hidden sm:inline">预览</span>
                                    </Link>
                                </Button>
                                {/* 编辑 → /admin/post-management/[id]/edit（原来是 onClick toast 占位） */}
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    aria-label="编辑"
                                    title="编辑"
                                    className={ACTION_TONE.edit}
                                    asChild
                                >
                                    <Link href={`/admin/post-management/${article.id}/edit`}>
                                        <Pencil className="size-4" />
                                        <span className="hidden sm:inline">编辑</span>
                                    </Link>
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    aria-label="删除"
                                    title="删除"
                                    className={ACTION_TONE.delete}
                                    disabled={deletingId === article.id}
                                    onClick={() => void handleDelete(article)}
                                >
                                    <Trash2 className="size-4" />
                                    <span className="hidden sm:inline">删除</span>
                                </Button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* 分页：固定在卡片底部，不随表格滚动 */}
            <div className="flex shrink-0 items-center justify-between border-t p-3">
                <div className="gap-2">
                    <span className="p-1 font-mono text-xs tabular-nums text-muted-foreground">共 {total} 篇</span>
                    {selected.length > 0 && (
                        <span className="ml-2 text-xs text-muted-foreground">已勾选 {selected.length} 篇</span>
                    )}
                    <span className="ml-2 text-xs text-muted-foreground">
                        第 {page} / {totalPages} 页
                    </span>
                </div>
                <PaginationControls
                    page={page}
                    totalPages={totalPages}
                    onPageChange={goPage}
                />
            </div>

            {/* 导入弹窗（受控）：导入会批量写文章表，弹窗内含后果提示 + 二次确认 + 结果明细 */}
            <ArticleImportDialog
                open={importOpen}
                onOpenChange={setImportOpen}
                onImported={() => setRefreshKey((prev) => prev + 1)}
            />

            {/* 分类 / 标签管理弹窗（受控）：改完刷新列表，让行内的分类/标签名称与筛选下拉同步 */}
            <ArticleTaxonomyDialog
                open={taxonomyOpen}
                onOpenChange={setTaxonomyOpen}
                state={refreshKey}
                onChanged={() => setRefreshKey((prev) => prev + 1)}
            />
        </div>
    );
}

type TaxonomyKind = "category" | "tag";

/**
 * 文章分类 / 标签管理弹窗：
 *   分类 POST   /api/admin/article-categories        → 远端 /post-categories
 *        PUT|DELETE /api/admin/article-categories/{id} → 远端 /post-categories/{id}
 *   标签 POST   /api/admin/article-tags              → 远端 /post-tags
 *        PUT|DELETE /api/admin/article-tags/{id}     → 远端 /post-tags/{id}
 *
 * 只做「名称」的增改删（后端 Create 只有 name 必填；slug 留空由后端生成），
 * 分类的 is_series / sort_order、标签的 slug 不在这个弹窗里改。
 * 任何写操作成功后回调 onChanged，让列表重拉（行内分类/标签名与筛选下拉跟着更新）。
 */
function ArticleTaxonomyDialog({
    open,
    onOpenChange,
    state,
    onChanged,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** 外部刷新计数：变化时重新拉取分类/标签 */
    state: number;
    onChanged: () => void;
}) {
    const [loading, setLoading] = useState(false);
    const [busy, setBusy] = useState(false);
    const [categories, setCategories] = useState<PostCategoryIO[]>([]);
    const [tags, setTags] = useState<PostTagIO[]>([]);
    const [newCategory, setNewCategory] = useState("");
    const [newTag, setNewTag] = useState("");
    /** 正在行内编辑的项（只改 name） */
    const [editing, setEditing] = useState<{ kind: TaxonomyKind; id: string; name: string } | null>(null);

    // 应用内确认弹窗（替代 window.confirm，见 components/confirm-provider.tsx）
    const confirm = useConfirm();

    const load = useCallback(async () => {
        try {
            const [cs, ts] = await Promise.all([getAdminArticleCategoriesApi(), getAdminArticleTagsApi()]);
            setCategories(cs);
            setTags(ts);
        } catch (e) {
            toast.error(e instanceof Error && e.message ? e.message : "获取分类/标签失败");
        }
    }, []);

    // 打开时（或外部要求刷新时）重新拉一次。
    // 延后到下一个 tick：effect 内同步 setState 会触发级联渲染告警（与 file-manager 同一做法）
    useEffect(() => {
        if (!open) return;
        const timer = setTimeout(() => {
            setLoading(true);
            void load().finally(() => setLoading(false));
        }, 0);
        return () => clearTimeout(timer);
    }, [open, state, load]);

    const handleOpenChange = (next: boolean) => {
        if (!next && busy) return;
        onOpenChange(next);
        if (!next) {
            setEditing(null);
            setNewCategory("");
            setNewTag("");
        }
    };

    const handleAdd = async (kind: TaxonomyKind) => {
        const name = (kind === "category" ? newCategory : newTag).trim();
        if (!name) {
            toast.error(kind === "category" ? "请填分类名称" : "请填标签名称");
            return;
        }
        setBusy(true);
        try {
            if (kind === "category") {
                await createAdminArticleCategoryApi({ name });
                setNewCategory("");
                toast.success(`已新建分类「${name}」`);
            } else {
                await createAdminArticleTagApi({ name });
                setNewTag("");
                toast.success(`已新建标签「${name}」`);
            }
            await load();
            onChanged();
        } catch (e) {
            toast.error(e instanceof Error && e.message ? e.message : "新建失败");
        } finally {
            setBusy(false);
        }
    };

    const handleSaveEdit = async () => {
        if (!editing) return;
        const name = editing.name.trim();
        if (!name) {
            toast.error("名称不能为空");
            return;
        }
        setBusy(true);
        try {
            if (editing.kind === "category") {
                await updateAdminArticleCategoryApi(editing.id, { name });
            } else {
                await updateAdminArticleTagApi(editing.id, { name });
            }
            setEditing(null);
            toast.success("已保存");
            await load();
            onChanged();
        } catch (e) {
            toast.error(e instanceof Error && e.message ? e.message : "保存失败");
        } finally {
            setBusy(false);
        }
    };

    const handleDelete = async (kind: TaxonomyKind, id: string, name: string) => {
        if (
            !(await confirm({
                title: `确定删除${kind === "category" ? "分类" : "标签"}「${name}」吗？`,
                description: "如果仍有文章在用它，删除可能会失败或影响这些文章的分类/标签。",
                danger: true,
            }))
        ) {
            return;
        }
        setBusy(true);
        try {
            if (kind === "category") {
                await deleteAdminArticleCategoryApi(id);
            } else {
                await deleteAdminArticleTagApi(id);
            }
            toast.success("已删除");
            await load();
            onChanged();
        } catch (e) {
            toast.error(e instanceof Error && e.message ? e.message : "删除失败");
        } finally {
            setBusy(false);
        }
    };

    /** 一行（分类 / 标签通用）：默认展示名称 + 引用数 + 编辑/删除，编辑态变成输入框 */
    const renderRow = (kind: TaxonomyKind, item: PostCategoryIO | PostTagIO) => {
        const isEditing = editing?.kind === kind && editing.id === item.id;
        return (
            <li key={item.id} className="flex items-center gap-2 border-b px-3 py-2 text-sm last:border-b-0">
                {isEditing ? (
                    <>
                        <Input
                            autoFocus
                            value={editing.name}
                            className="h-7 flex-1 text-xs"
                            disabled={busy}
                            onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") void handleSaveEdit();
                                if (e.key === "Escape") setEditing(null);
                            }}
                        />
                        <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 shrink-0"
                            aria-label="保存"
                            disabled={busy}
                            onClick={() => void handleSaveEdit()}
                        >
                            <Check className="size-3.5" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 shrink-0"
                            aria-label="取消"
                            disabled={busy}
                            onClick={() => setEditing(null)}
                        >
                            <X className="size-3.5" />
                        </Button>
                    </>
                ) : (
                    <>
                        <span className="min-w-0 flex-1 truncate">{item.name}</span>
                        <span className="shrink-0 rounded bg-muted px-1.5 py-px text-[11px] text-muted-foreground">
                            {item.count}
                        </span>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 shrink-0"
                            aria-label="重命名"
                            disabled={busy}
                            onClick={() => setEditing({ kind, id: item.id, name: item.name })}
                        >
                            <Pencil className="size-3.5" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 shrink-0 text-destructive hover:text-destructive"
                            aria-label="删除"
                            disabled={busy}
                            onClick={() => void handleDelete(kind, item.id, item.name)}
                        >
                            <Trash2 className="size-3.5" />
                        </Button>
                    </>
                )}
            </li>
        );
    };

    return (
        <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
            <DialogPrimitive.Portal>
                <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
                <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 max-h-[86vh] w-[min(94vw,46rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto soft-surface p-5 shadow-2xl data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
                    <DialogPrimitive.Title className="text-base font-semibold">分类 / 标签管理</DialogPrimitive.Title>
                    <DialogPrimitive.Description className="mt-1 text-xs text-muted-foreground">
                        只改名称；分类的「系列 / 排序」与标签别名不在这里维护。删除仍被文章引用的分类或标签可能失败（后端会返回原因）。
                    </DialogPrimitive.Description>

                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        {/* 分类 */}
                        <section className="flex min-h-0 flex-col rounded-lg border">
                            <header className="flex items-center justify-between border-b px-3 py-2 text-sm font-medium">
                                <span>分类</span>
                                <span className="text-xs text-muted-foreground">{categories.length} 个</span>
                            </header>
                            <div className="flex items-center gap-2 border-b p-2">
                                <Input
                                    value={newCategory}
                                    className="h-8 text-xs"
                                    placeholder="新分类名称"
                                    disabled={busy}
                                    onChange={(e) => setNewCategory(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") void handleAdd("category");
                                    }}
                                />
                                <Button
                                    size="sm"
                                    className="h-8 shrink-0"
                                    disabled={busy || !newCategory.trim()}
                                    onClick={() => void handleAdd("category")}
                                >
                                    <Plus className="size-3.5" />
                                    新建
                                </Button>
                            </div>
                            <ul className="max-h-[46vh] overflow-y-auto">
                                {loading && categories.length === 0 ? (
                                    <li className="px-3 py-4 text-center text-xs text-muted-foreground">加载中…</li>
                                ) : categories.length === 0 ? (
                                    <li className="px-3 py-4 text-center text-xs text-muted-foreground">暂无分类</li>
                                ) : (
                                    categories.map((c) => renderRow("category", c))
                                )}
                            </ul>
                        </section>

                        {/* 标签 */}
                        <section className="flex min-h-0 flex-col rounded-lg border">
                            <header className="flex items-center justify-between border-b px-3 py-2 text-sm font-medium">
                                <span>标签</span>
                                <span className="text-xs text-muted-foreground">{tags.length} 个</span>
                            </header>
                            <div className="flex items-center gap-2 border-b p-2">
                                <Input
                                    value={newTag}
                                    className="h-8 text-xs"
                                    placeholder="新标签名称"
                                    disabled={busy}
                                    onChange={(e) => setNewTag(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") void handleAdd("tag");
                                    }}
                                />
                                <Button
                                    size="sm"
                                    className="h-8 shrink-0"
                                    disabled={busy || !newTag.trim()}
                                    onClick={() => void handleAdd("tag")}
                                >
                                    <Plus className="size-3.5" />
                                    新建
                                </Button>
                            </div>
                            <ul className="max-h-[46vh] overflow-y-auto">
                                {loading && tags.length === 0 ? (
                                    <li className="px-3 py-4 text-center text-xs text-muted-foreground">加载中…</li>
                                ) : tags.length === 0 ? (
                                    <li className="px-3 py-4 text-center text-xs text-muted-foreground">暂无标签</li>
                                ) : (
                                    tags.map((t) => renderRow("tag", t))
                                )}
                            </ul>
                        </section>
                    </div>

                    <div className="mt-5 flex justify-end gap-2">
                        <DialogPrimitive.Close asChild>
                            <Button variant="outline" size="sm" disabled={busy}>
                                关闭
                            </Button>
                        </DialogPrimitive.Close>
                    </div>
                </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
    );
}
