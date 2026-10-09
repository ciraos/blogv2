"use client";

/**
 * 知识库管理（已接真后端：PRO 模块 /api/pro/admin/knowledge）。
 *
 * ==== 数据来源 ====
 * 官方前端快照 scripts/theme/theme-anheyu-next-main/src/lib/api/knowledge.ts 是唯一权威契约：
 *   GET    documents?status&page&page_size   列表 { documents, total, page, page_size }
 *   POST   documents                         body { title, content } 新建
 *   GET    documents/:id                     详情
 *   DELETE documents/:id                     删除单篇
 *   DELETE documents/batch                   body { ids } 批量删除
 *   POST   documents/:id/reindex             单篇重建索引
 *   POST   upload                            multipart file（≤10MB，官方 hook 里写死）
 *   DELETE clear                             清空
 *   POST   sync-articles                     body { force } 同步文章
 *   GET    stats / config / supported-types / rebuild-status
 * 线上只读探活：上述 GET 未登录均 401（路由存在、仅需鉴权）。
 *
 * ==== 两个刻意的取舍（都在下面代码里复述）====
 * 1) 关键词搜索是「当前页内过滤」：官方列表请求类型 ListKnowledgeDocumentsRequest 只有
 *    status / page / page_size，没有 keyword 字段。凭空加 ?keyword= 只会静默失效，
 *    所以这里明确做成页内过滤，并在 UI 上写清楚。
 * 2) 没有「全量重建索引」接口：官方只提供单篇 reindex；rebuild-status 是后端切换
 *    embedding 模型后的全量重嵌入进度，前端只负责轮询展示 + 算进度条。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
    BadgeCheck,
    Blocks,
    Clock,
    Database,
    Eye,
    FileSearch,
    Hash,
    Plus,
    RefreshCw,
    RotateCcw,
    Search,
    Sparkles,
    Trash2,
    TriangleAlert,
    Upload,
    X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PaginationControls } from "@/components/pagination-controls";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { ACTION_TONE } from "@/lib/action-tones";
import {
    KnowledgeApiError,
    batchDeleteKnowledgeDocumentsApi,
    clearKnowledgeApi,
    createKnowledgeDocumentApi,
    deleteKnowledgeDocumentApi,
    getKnowledgeConfigApi,
    getKnowledgeDocumentApi,
    getKnowledgeDocumentsApi,
    getKnowledgeRebuildStatusApi,
    getKnowledgeStatsApi,
    getKnowledgeSupportedTypesApi,
    reindexKnowledgeDocumentApi,
    syncKnowledgeArticlesApi,
    uploadKnowledgeDocumentApi,
    type KnowledgeConfig,
    type KnowledgeDocument,
    type KnowledgeDocumentStatus,
    type KnowledgeSourceType,
    type KnowledgeStats,
    type RebuildStatus,
} from "@/lib/api-knowledge";

/** 分页档位（page_size 直传后端） */
const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

/** 上传单文件大小上限：与官方 hook use-knowledge-page.ts:179 一致（10MB） */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** 状态徽章（KnowledgeDocumentStatus，中文文案与官方前端一致） */
const STATUS_META: Record<KnowledgeDocumentStatus, { label: string; cls: string }> = {
    pending: { label: "待处理", cls: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400" },
    processing: { label: "处理中", cls: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400" },
    indexed: { label: "已索引", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400" },
    failed: { label: "失败", cls: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400" },
    disabled: { label: "已禁用", cls: "bg-muted text-muted-foreground" },
};

/** 状态筛选项（不含 disabled：官方筛选下拉也没有它，保持列表口径一致） */
const STATUS_OPTIONS: { value: KnowledgeDocumentStatus; label: string }[] = [
    { value: "indexed", label: "已索引" },
    { value: "pending", label: "待处理" },
    { value: "processing", label: "处理中" },
    { value: "failed", label: "失败" },
];

/** 来源徽章（KnowledgeSourceType，中文文案） */
const SOURCE_META: Record<KnowledgeSourceType, { label: string; cls: string }> = {
    article: { label: "文章", cls: "bg-sky-500/15 text-sky-600 dark:text-sky-400" },
    upload: { label: "上传", cls: "bg-violet-500/15 text-violet-600 dark:text-violet-400" },
    custom: { label: "自定义", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
    webpage: { label: "网页", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
};

/** 时间戳（YYYY-MM-DD HH:MM，本地时区）；后端时间字段是 ISO 字符串 */
function formatDateTime(iso?: string): string {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return formatDate(d);
}

/** Unix 秒级时间戳（RebuildStatus 的 start_time / end_time 用的是秒，不是毫秒） */
function formatUnixTime(seconds?: number): string {
    if (!seconds || !Number.isFinite(seconds)) return "—";
    return formatDate(new Date(seconds * 1000));
}

function formatDate(d: Date): string {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 千分位（content_length 的口径官方未明确，按数值原样展示，不做字节换算以免误导） */
function formatCount(value?: number): string {
    const n = Number(value);
    if (!Number.isFinite(n)) return "—";
    return n.toLocaleString("zh-CN");
}

/** 统一取错误文案：代理层抛的是 KnowledgeApiError，其它按 Error 兜底 */
function errorMessage(error: unknown, fallback: string): string {
    if (error instanceof KnowledgeApiError) return error.message;
    if (error instanceof Error) return error.message;
    return fallback;
}

/** 统计磁贴配置（口径照官方 KnowledgeStats） */
const STAT_TILES = [
    { key: "total_documents", label: "文档总数", icon: Database, chip: "bg-primary/10 text-primary" },
    {
        key: "indexed_documents",
        label: "已索引",
        icon: BadgeCheck,
        chip: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    },
    {
        key: "pending_documents",
        label: "待处理",
        icon: Clock,
        chip: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    },
    {
        key: "failed_documents",
        label: "失败",
        icon: TriangleAlert,
        chip: "bg-red-500/10 text-red-600 dark:text-red-400",
    },
    { key: "total_chunks", label: "总分块", icon: Blocks, chip: "bg-sky-500/10 text-sky-600 dark:text-sky-400" },
    { key: "total_tokens", label: "总 Token", icon: Hash, chip: "bg-violet-500/10 text-violet-600 dark:text-violet-400" },
] as const;

// 移动端(<640px)：grid-cols-1 把每个单元格竖排成卡片；≥640px：恢复表格式列布局。
// 列顺序：标题(含多选框) / 来源 / 类型 / 长度 / 状态 / 分块 / 索引时间 / 创建时间 / 操作
const rowGrid = "sm:grid-cols-[minmax(0,1fr)_72px_104px_80px_88px_64px_140px_140px_128px]";
const rowMinW = "sm:min-w-[1120px]";

/** 表头/数据行共用的表单控件高度，避免两个工具栏视觉跳变 */
const CONTROL_H = "h-8";

/** 单行模板 */
function KnowledgeRow({
    item,
    selected,
    busy,
    onToggle,
    onReindex,
    onView,
    onDelete,
}: {
    item: KnowledgeDocument;
    selected: boolean;
    busy: boolean;
    onToggle: (id: number, checked: boolean) => void;
    onReindex: (item: KnowledgeDocument) => void;
    onView: (item: KnowledgeDocument) => void;
    onDelete: (item: KnowledgeDocument) => void;
}) {
    const status = STATUS_META[item.status] ?? { label: String(item.status), cls: "bg-muted text-muted-foreground" };
    const source = SOURCE_META[item.source_type] ?? {
        label: String(item.source_type),
        cls: "bg-muted text-muted-foreground",
    };
    return (
        <div
            className={`grid grid-cols-1 items-center gap-x-3 gap-y-2 border-b px-4 py-3 text-sm transition-colors last:border-b-0 hover:bg-muted/40 sm:gap-y-1 ${rowMinW} ${rowGrid}`}
        >
            {/* 标题：多选框放第一格，避免为它单独加一列（列宽已经排满） */}
            <div className="flex min-w-0 items-start gap-2">
                <Checkbox
                    checked={selected}
                    onCheckedChange={(checked) => onToggle(item.id, checked === true)}
                    aria-label={`选择「${item.title}」`}
                    className="mt-0.5"
                />
                <FileSearch className="mt-0.5 size-4 shrink-0 text-muted-foreground/60" />
                <div className="min-w-0">
                    <div className="line-clamp-1 font-medium text-foreground">{item.title || "—"}</div>
                    {item.status === "failed" && item.error_message && (
                        <div className="line-clamp-1 text-xs text-red-600 dark:text-red-400">
                            {item.error_message}
                        </div>
                    )}
                </div>
            </div>
            <div>
                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${source.cls}`}>
                    {source.label}
                </span>
            </div>
            <div className="truncate font-mono text-xs text-muted-foreground">
                <span className="mr-1 font-sans sm:hidden">类型</span>
                {item.content_type || "—"}
            </div>
            <div className="text-xs tabular-nums text-muted-foreground sm:text-right">
                <span className="mr-1 sm:hidden">长度</span>
                {formatCount(item.content_length)}
            </div>
            <div className="sm:text-center">
                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${status.cls}`}>
                    {status.label}
                </span>
            </div>
            <div className="text-xs tabular-nums text-muted-foreground sm:text-center">
                <span className="mr-1 sm:hidden">分块</span>
                {formatCount(item.chunk_count)}
            </div>
            <div className="text-xs text-muted-foreground">
                <span className="mr-1 sm:hidden">索引</span>
                {formatDateTime(item.indexed_at)}
            </div>
            <div className="text-xs text-muted-foreground">
                <span className="mr-1 sm:hidden">创建</span>
                {formatDateTime(item.created_at)}
            </div>
            <div className="flex items-center gap-1 sm:justify-end">
                <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="重新索引"
                    title="重新索引"
                    className={ACTION_TONE.key}
                    disabled={busy}
                    onClick={() => onReindex(item)}
                >
                    <RefreshCw className="size-4" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="查看"
                    title="查看文档"
                    className={ACTION_TONE.view}
                    onClick={() => onView(item)}
                >
                    <Eye className="size-4" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon-sm"
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

/** 统计磁贴 */
function StatTile({
    icon: Icon,
    label,
    value,
    chip,
}: {
    icon: typeof Database;
    label: string;
    value: string;
    chip: string;
}) {
    return (
        <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2">
            <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${chip}`}>
                <Icon className="size-4" />
            </span>
            <div className="min-w-0">
                <p className="truncate text-xs text-muted-foreground">{label}</p>
                <p className="text-lg font-semibold tabular-nums text-foreground">{value}</p>
            </div>
        </div>
    );
}

/**
 * 知识库管理页：统计 + 配置 + 重建进度 + 文档列表（分页/状态筛选/页内搜索）+ 全部写操作。
 */
export function KnowledgeManager() {
    const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<number>(PAGE_SIZE_OPTIONS[1]);
    const [statusFilter, setStatusFilter] = useState<KnowledgeDocumentStatus | "">("");
    const [keyword, setKeyword] = useState("");
    const [loading, setLoading] = useState(true);

    const [stats, setStats] = useState<KnowledgeStats | null>(null);
    const [config, setConfig] = useState<KnowledgeConfig | null>(null);
    const [supportedTypes, setSupportedTypes] = useState<string[]>([]);
    const [rebuild, setRebuild] = useState<RebuildStatus | null>(null);

    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    /** 正在执行的写操作名（用于禁用按钮，避免重复提交） */
    const [busyAction, setBusyAction] = useState<string | null>(null);

    const [showCreate, setShowCreate] = useState(false);
    const [newTitle, setNewTitle] = useState("");
    const [newContent, setNewContent] = useState("");
    const [detail, setDetail] = useState<KnowledgeDocument | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);
    /** 轮询句柄：用 ref 存，卸载时才能清干净（官方 hook 同款做法） */
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const busy = busyAction !== null;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    // ---- 拉取 ----

    const fetchDocuments = useCallback(async () => {
        try {
            const data = await getKnowledgeDocumentsApi({
                status: statusFilter || undefined,
                page,
                page_size: pageSize,
            });
            setDocuments(data.documents ?? []);
            setTotal(data.total ?? 0);
        } catch (error) {
            toast.error(errorMessage(error, "获取文档列表失败"));
        } finally {
            setLoading(false);
        }
    }, [page, pageSize, statusFilter]);

    const fetchStats = useCallback(async () => {
        try {
            setStats(await getKnowledgeStatsApi());
        } catch {
            // 统计失败不打断主流程（列表才是主体），静默即可
        }
    }, []);

    const fetchConfig = useCallback(async () => {
        try {
            setConfig(await getKnowledgeConfigApi());
        } catch {
            // 同上
        }
    }, []);

    const fetchSupportedTypes = useCallback(async () => {
        try {
            setSupportedTypes(await getKnowledgeSupportedTypesApi());
        } catch {
            // 同上：拿不到就不限制 accept
        }
    }, []);

    const fetchRebuildStatus = useCallback(async () => {
        try {
            setRebuild(await getKnowledgeRebuildStatusApi());
        } catch {
            // 轮询接口偶发失败不该弹一堆 toast
        }
    }, []);

    /** 写操作后统一刷新（列表 + 统计 + 配置 + 进度） */
    const refreshAll = useCallback(() => {
        void fetchDocuments();
        void fetchStats();
        void fetchConfig();
        void fetchRebuildStatus();
    }, [fetchDocuments, fetchStats, fetchConfig, fetchRebuildStatus]);

    useEffect(() => {
        // 延后到下一个 tick：effect 内同步 setState 会触发级联渲染（react-hooks/set-state-in-effect）
        const timer = setTimeout(() => void fetchDocuments(), 0);
        return () => clearTimeout(timer);
    }, [fetchDocuments]);

    useEffect(() => {
        // 同上：统计/配置/支持类型/重建进度只在进页面时拉一次，不随分页变化
        const timer = setTimeout(() => {
            void fetchStats();
            void fetchConfig();
            void fetchSupportedTypes();
            void fetchRebuildStatus();
        }, 0);
        return () => clearTimeout(timer);
    }, [fetchStats, fetchConfig, fetchSupportedTypes, fetchRebuildStatus]);

    // 重建中才开轮询，重建一结束就停并补一次全量刷新（进度条不会停在 99%）
    useEffect(() => {
        if (!rebuild?.is_rebuilding) {
            if (pollRef.current) {
                clearInterval(pollRef.current);
                pollRef.current = null;
            }
            return;
        }
        if (!pollRef.current) {
            pollRef.current = setInterval(() => {
                void fetchRebuildStatus();
            }, 3000);
        }
        return () => {
            if (pollRef.current) {
                clearInterval(pollRef.current);
                pollRef.current = null;
            }
        };
    }, [rebuild?.is_rebuilding, fetchRebuildStatus]);

    // 列表删除后当前页可能空了：回退一页，避免停在空白页
    // 延后到下一个 tick：effect 内同步 setState 会触发级联渲染（react-hooks/set-state-in-effect）
    useEffect(() => {
        if (loading || documents.length > 0 || page <= 1) return;
        const timer = setTimeout(() => setPage((p) => Math.max(1, p - 1)), 0);
        return () => clearTimeout(timer);
    }, [loading, documents.length, page]);

    // ---- 筛选 ----

    /** 关键词过滤只作用于当前页（后端列表接口没有 keyword 参数，见文件头注释） */
    const visibleDocuments = keyword.trim()
        ? documents.filter((doc) => {
              const q = keyword.trim().toLowerCase();
              return (
                  doc.title?.toLowerCase().includes(q) ||
                  doc.content_type?.toLowerCase().includes(q) ||
                  doc.source_type?.toLowerCase().includes(q)
              );
          })
        : documents;

    const resetFilters = () => {
        setStatusFilter("");
        setKeyword("");
        setPage(1);
    };

    const allVisibleSelected =
        visibleDocuments.length > 0 && visibleDocuments.every((doc) => selectedIds.includes(doc.id));

    const toggleSelected = (id: number, checked: boolean) => {
        setSelectedIds((prev) => (checked ? [...new Set([...prev, id])] : prev.filter((x) => x !== id)));
    };

    const toggleSelectAllVisible = (checked: boolean) => {
        const visibleIds = visibleDocuments.map((doc) => doc.id);
        setSelectedIds((prev) => (checked ? [...new Set([...prev, ...visibleIds])] : prev.filter((id) => !visibleIds.includes(id))));
    };

    // ---- 写操作（每一个都有二次确认；本机验证时全部只读不触发） ----

    const handleCreate = async () => {
        const title = newTitle.trim();
        const content = newContent.trim();
        if (!title || !content) {
            toast.error("标题与正文都不能为空");
            return;
        }
        setBusyAction("create");
        try {
            await createKnowledgeDocumentApi({ title, content });
            toast.success("文档已提交索引");
            setNewTitle("");
            setNewContent("");
            setShowCreate(false);
            refreshAll();
        } catch (error) {
            toast.error(errorMessage(error, "新建文档失败"));
        } finally {
            setBusyAction(null);
        }
    };

    /** 批量导入：官方只有单文件 upload，这里按顺序逐个上传，逐条汇报结果 */
    const handleUploadFiles = async (files: FileList) => {
        const list = Array.from(files);
        if (list.length === 0) return;

        const oversize = list.filter((f) => f.size > MAX_UPLOAD_BYTES);
        if (oversize.length > 0) {
            toast.error(`有 ${oversize.length} 个文件超过 10MB，已跳过`);
        }
        const targets = list.filter((f) => f.size <= MAX_UPLOAD_BYTES);
        if (targets.length === 0) return;

        if (!window.confirm(`确定上传并索引 ${targets.length} 个文件吗？`)) return;

        setBusyAction("upload");
        let ok = 0;
        let failed = 0;
        for (const file of targets) {
            try {
                await uploadKnowledgeDocumentApi(file);
                ok += 1;
            } catch {
                failed += 1;
            }
        }
        setBusyAction(null);
        if (failed === 0) toast.success(`已上传 ${ok} 个文件，正在索引`);
        else toast.warning(`上传完成：成功 ${ok} 个，失败 ${failed} 个`);
        refreshAll();
        // 清空 input.value，否则同一个文件再选一次不会触发 change
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const handleReindex = async (doc: KnowledgeDocument) => {
        setBusyAction(`reindex-${doc.id}`);
        try {
            await reindexKnowledgeDocumentApi(doc.id);
            toast.success(`「${doc.title}」正在重新索引`);
            refreshAll();
        } catch (error) {
            toast.error(errorMessage(error, "重新索引失败"));
        } finally {
            setBusyAction(null);
        }
    };

    const handleView = async (doc: KnowledgeDocument) => {
        // 先展示列表里已有的数据，再拉详情覆盖，避免点开是空白
        setDetail(doc);
        try {
            setDetail(await getKnowledgeDocumentApi(doc.id));
        } catch {
            // 详情接口失败就保留列表数据
        }
    };

    const handleDelete = async (doc: KnowledgeDocument) => {
        if (!window.confirm(`确定删除文档「${doc.title}」吗？该操作会同时删除其分块，且不可撤销。`)) return;
        setBusyAction(`delete-${doc.id}`);
        try {
            await deleteKnowledgeDocumentApi(doc.id);
            toast.success("删除成功");
            setSelectedIds((prev) => prev.filter((id) => id !== doc.id));
            refreshAll();
        } catch (error) {
            toast.error(errorMessage(error, "删除失败"));
        } finally {
            setBusyAction(null);
        }
    };

    const handleBatchDelete = async () => {
        if (selectedIds.length === 0) return;
        if (!window.confirm(`确定删除选中的 ${selectedIds.length} 篇文档吗？其分块会一并删除，且不可撤销。`)) return;
        setBusyAction("batch-delete");
        try {
            const result = await batchDeleteKnowledgeDocumentsApi(selectedIds);
            const msg = `已删除 ${result.documents_deleted} 篇文档、${result.chunks_deleted} 个分块`;
            if (result.failed_ids?.length) {
                toast.warning(`${msg}（${result.failed_ids.length} 个文档的向量未清理干净）`);
            } else {
                toast.success(msg);
            }
            setSelectedIds([]);
            refreshAll();
        } catch (error) {
            toast.error(errorMessage(error, "批量删除失败"));
        } finally {
            setBusyAction(null);
        }
    };

    const handleClearAll = async () => {
        // 清空是不可逆的重操作，二次确认里带上方言明的后果
        if (!window.confirm("确定清空整个知识库吗？所有文档、分块与向量都会被删除，且不可撤销。")) return;
        setBusyAction("clear");
        try {
            const result = await clearKnowledgeApi();
            const msg = `已清空 ${result.documents_deleted} 篇文档、${result.chunks_deleted} 个分块`;
            if (result.vectors_cleared) toast.success(msg);
            else toast.warning(`${msg}（向量存储未完全清空）`);
            setSelectedIds([]);
            refreshAll();
        } catch (error) {
            toast.error(errorMessage(error, "清空失败"));
        } finally {
            setBusyAction(null);
        }
    };

    const handleSync = async (force: boolean) => {
        const tip = force
            ? "强制同步会重新嵌入所有文章（耗时较长），确定继续吗？"
            : "确定把站点文章同步进知识库吗？";
        if (!window.confirm(tip)) return;
        setBusyAction(force ? "sync-force" : "sync");
        try {
            const result = await syncKnowledgeArticlesApi(force);
            toast.success(
                `同步完成：共 ${result.total_articles} 篇，新增 ${result.new_documents}，更新 ${result.updated_documents}，跳过 ${result.skipped_documents}`
            );
            refreshAll();
        } catch (error) {
            toast.error(errorMessage(error, "同步失败"));
        } finally {
            setBusyAction(null);
        }
    };

    // ---- 派生展示值 ----

    const statValue = (key: (typeof STAT_TILES)[number]["key"]): string => {
        if (!stats) return "—";
        return formatCount(stats[key]);
    };

    const rebuildProgress =
        rebuild && rebuild.total_docs > 0
            ? Math.min(100, Math.round((rebuild.processed_docs / rebuild.total_docs) * 100))
            : 0;

    return (
        <div className="admin-card">
            {/* 统计磁贴：固定不滚动 */}
            <div className="grid shrink-0 grid-cols-2 gap-2 border-b p-3 md:grid-cols-3 xl:grid-cols-6">
                {STAT_TILES.map((tile) => (
                    <StatTile
                        key={tile.key}
                        icon={tile.icon}
                        label={tile.label}
                        value={statValue(tile.key)}
                        chip={tile.chip}
                    />
                ))}
            </div>

            {/* 运行配置：只读展示 config + supported-types */}
            <div className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-1.5 border-b bg-muted/20 px-4 py-2 text-xs">
                <span className="font-medium text-muted-foreground">运行配置</span>
                {config ? (
                    <>
                        <span
                            className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                                config.enabled
                                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                                    : "bg-muted text-muted-foreground"
                            }`}
                        >
                            {config.enabled ? "已启用" : "未启用"}
                        </span>
                        <span className="text-muted-foreground">
                            Embedding
                            <span className="ml-1.5 font-medium text-foreground">
                                {config.embedding_provider || "—"}/{config.embedding_model || "—"}
                            </span>
                        </span>
                        <span className="text-muted-foreground">
                            向量库
                            <span className="ml-1.5 font-medium text-foreground">{config.vector_store || "—"}</span>
                        </span>
                        <span className="text-muted-foreground">
                            维度
                            <span className="ml-1.5 font-medium tabular-nums text-foreground">
                                {config.vector_dimension || "—"}
                            </span>
                        </span>
                    </>
                ) : (
                    <span className="text-muted-foreground/70">读取中…</span>
                )}
                <span className="text-muted-foreground">
                    支持类型
                    <span className="ml-1.5 font-mono font-medium text-foreground">
                        {supportedTypes.length > 0 ? supportedTypes.join(" ") : "—"}
                    </span>
                </span>
            </div>

            {/* 重建进度：仅在后端有状态时出现（is_rebuilding 或已有 end_time/error） */}
            {rebuild && (rebuild.is_rebuilding || rebuild.end_time > 0 || rebuild.error) && (
                <div className="shrink-0 border-b bg-muted/30 px-4 py-2 text-xs">
                    {rebuild.is_rebuilding ? (
                        <div className="flex flex-wrap items-center gap-3">
                            <RefreshCw className="size-3.5 animate-spin text-primary" />
                            <span className="font-medium text-foreground">
                                正在重建索引：
                                {rebuild.old_provider}/{rebuild.old_model} → {rebuild.new_provider}/
                                {rebuild.new_model}
                            </span>
                            <div className="h-1.5 w-40 overflow-hidden rounded-full bg-muted">
                                <div className="h-full bg-primary transition-all" style={{ width: `${rebuildProgress}%` }} />
                            </div>
                            <span className="tabular-nums text-muted-foreground">
                                {rebuild.processed_docs}/{rebuild.total_docs}（{rebuildProgress}%）
                                {rebuild.failed_docs > 0 ? `，失败 ${rebuild.failed_docs}` : ""}
                            </span>
                        </div>
                    ) : rebuild.error ? (
                        <span className="text-red-600 dark:text-red-400">重建失败：{rebuild.error}</span>
                    ) : (
                        <span className="text-muted-foreground">
                            上次重建完成于 {formatUnixTime(rebuild.end_time)}：已处理 {rebuild.processed_docs}/
                            {rebuild.total_docs}，失败 {rebuild.failed_docs}
                        </span>
                    )}
                </div>
            )}

            {/* 工具栏 */}
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b bg-muted/40 px-4 py-2.5">
                <div className="flex flex-1 flex-wrap items-center gap-2">
                    <div className="relative w-56">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={keyword}
                            onChange={(e) => setKeyword(e.target.value)}
                            placeholder="搜索本页文档（标题/类型）"
                            className={`${CONTROL_H} pl-8 pr-8 text-xs`}
                            aria-label="搜索当前页知识库文档"
                        />
                        {keyword && (
                            <button
                                type="button"
                                onClick={() => setKeyword("")}
                                aria-label="清空搜索"
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>

                    <Select
                        value={statusFilter || "all"}
                        onValueChange={(v) => {
                            setStatusFilter(v === "all" ? "" : (v as KnowledgeDocumentStatus));
                            setPage(1);
                        }}
                    >
                        <SelectTrigger className={`${CONTROL_H} w-max text-xs`} aria-label="状态筛选">
                            <SelectValue placeholder="全部状态" />
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

                    <Button variant="outline" size="sm" className={CONTROL_H} onClick={resetFilters}>
                        <RotateCcw className="size-3.5" />
                        重置
                    </Button>

                    <span className="text-xs text-muted-foreground">
                        共 <span className="font-medium text-foreground">{total}</span> 篇文档
                        {keyword.trim() && (
                            <span className="ml-1.5 text-muted-foreground/70">
                                （搜索仅作用于当前页，后端列表接口无关键词参数）
                            </span>
                        )}
                    </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {selectedIds.length > 0 && (
                        <Button
                            variant="outline"
                            size="sm"
                            className={`${CONTROL_H} text-red-600 dark:text-red-400`}
                            disabled={busy}
                            onClick={handleBatchDelete}
                        >
                            <Trash2 className="size-3.5" />
                            批量删除（{selectedIds.length}）
                        </Button>
                    )}
                    <Button
                        variant="outline"
                        size="sm"
                        className={CONTROL_H}
                        disabled={busy}
                        onClick={handleClearAll}
                    >
                        <Trash2 className="size-3.5" />
                        清空
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className={CONTROL_H}
                        disabled={busy}
                        onClick={() => handleSync(false)}
                    >
                        <Sparkles className="size-3.5" />
                        同步文章
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className={CONTROL_H}
                        disabled={busy}
                        title="重新嵌入所有文章，耗时较长"
                        onClick={() => handleSync(true)}
                    >
                        <Sparkles className="size-3.5" />
                        强制同步
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className={CONTROL_H}
                        disabled={busy}
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <Upload className="size-3.5" />
                        批量导入
                    </Button>
                    {/* 隐藏的 file input：accept 用后端 supported-types 拼，拿不到就不限制 */}
                    <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept={supportedTypes.length > 0 ? supportedTypes.join(",") : undefined}
                        className="hidden"
                        onChange={(e) => {
                            if (e.target.files) void handleUploadFiles(e.target.files);
                        }}
                    />
                    <Button
                        size="sm"
                        className={`${CONTROL_H} bg-primary text-primary-foreground hover:bg-primary/90`}
                        disabled={busy}
                        onClick={() => setShowCreate((v) => !v)}
                    >
                        <Plus className="size-3.5" />
                        新建索引
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className={CONTROL_H}
                        disabled={busy}
                        onClick={refreshAll}
                    >
                        <RefreshCw className="size-3.5" />
                        刷新
                    </Button>
                </div>
            </div>

            {/* 新建索引面板（内联，不用弹窗：项目里没有 Dialog 组件，列表页统一走内联/抽屉） */}
            {showCreate && (
                <div className="shrink-0 space-y-2 border-b bg-muted/20 px-4 py-3">
                    <div className="flex flex-wrap items-end gap-3">
                        <div className="w-72 space-y-1">
                            <Label htmlFor="knowledge-new-title" className="text-xs">
                                文档标题
                            </Label>
                            <Input
                                id="knowledge-new-title"
                                value={newTitle}
                                onChange={(e) => setNewTitle(e.target.value)}
                                placeholder="请输入文档标题"
                                className={`${CONTROL_H} text-xs`}
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                size="sm"
                                className={CONTROL_H}
                                disabled={busy}
                                onClick={handleCreate}
                            >
                                提交索引
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                className={CONTROL_H}
                                onClick={() => setShowCreate(false)}
                            >
                                取消
                            </Button>
                        </div>
                    </div>
                    <textarea
                        value={newContent}
                        onChange={(e) => setNewContent(e.target.value)}
                        placeholder="粘贴文档正文（纯文本 / Markdown 均可）"
                        rows={6}
                        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    />
                </div>
            )}

            {/* 文档详情面板 */}
            {detail && (
                <div className="shrink-0 border-b bg-muted/20 px-4 py-3 text-xs">
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
                            <span className="font-medium text-foreground">{detail.title}</span>
                            <span className="text-muted-foreground">
                                ID <span className="font-mono tabular-nums text-foreground">{detail.id}</span>
                            </span>
                            <span className="text-muted-foreground">
                                来源 <span className="text-foreground">{detail.source_type}</span>
                            </span>
                            <span className="text-muted-foreground">
                                类型 <span className="font-mono text-foreground">{detail.content_type || "—"}</span>
                            </span>
                            <span className="text-muted-foreground">
                                长度 <span className="tabular-nums text-foreground">{formatCount(detail.content_length)}</span>
                            </span>
                            <span className="text-muted-foreground">
                                分块 <span className="tabular-nums text-foreground">{formatCount(detail.chunk_count)}</span>
                            </span>
                            <span className="text-muted-foreground">
                                索引时间 <span className="text-foreground">{formatDateTime(detail.indexed_at)}</span>
                            </span>
                            <span className="text-muted-foreground">
                                更新时间 <span className="text-foreground">{formatDateTime(detail.updated_at)}</span>
                            </span>
                            {detail.source_url && (
                                <span className="text-muted-foreground">
                                    源地址{" "}
                                    <a
                                        href={detail.source_url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-primary underline-offset-4 hover:underline"
                                    >
                                        {detail.source_url}
                                    </a>
                                </span>
                            )}
                        </div>
                        <Button variant="ghost" size="icon-sm" aria-label="关闭详情" onClick={() => setDetail(null)}>
                            <X className="size-4" />
                        </Button>
                    </div>
                    {detail.error_message && (
                        <p className="mt-1.5 text-red-600 dark:text-red-400">错误信息：{detail.error_message}</p>
                    )}
                </div>
            )}

            {/* 列表：卡片内唯一滚动区 */}
            <div className="admin-scroll">
                <div
                    className={`admin-sticky-head hidden items-center gap-3 border-b px-4 py-2.5 text-xs font-medium text-muted-foreground sm:grid ${rowMinW} ${rowGrid}`}
                >
                    <span className="flex items-center gap-2">
                        <Checkbox
                            checked={allVisibleSelected}
                            onCheckedChange={(checked) => toggleSelectAllVisible(checked === true)}
                            aria-label="全选当前页"
                        />
                        标题
                    </span>
                    <span>来源</span>
                    <span>类型</span>
                    <span className="text-right">长度</span>
                    <span className="text-center">状态</span>
                    <span className="text-center">分块</span>
                    <span>索引时间</span>
                    <span>创建时间</span>
                    <span className="text-right">操作</span>
                </div>

                {loading ? (
                    <div className="flex flex-col items-center justify-center gap-1.5 py-12 text-sm text-muted-foreground">
                        <RefreshCw className="size-5 animate-spin opacity-60" />
                        <span>正在读取知识库文档…</span>
                    </div>
                ) : visibleDocuments.length === 0 ? (
                    <div className="flex min-h-64 flex-col items-center justify-center gap-2 px-4 py-12 text-center">
                        <span className="flex size-12 items-center justify-center rounded-full border bg-muted/60">
                            <FileSearch className="size-5 text-muted-foreground/60" />
                        </span>
                        <p className="text-sm font-medium text-foreground">
                            {keyword.trim() || statusFilter ? "当前筛选没有匹配的文档" : "暂无知识库文档"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                            {keyword.trim() || statusFilter ? "试试重置筛选条件" : "使用「新建索引」「批量导入」或「同步文章」录入"}
                        </p>
                        <Button
                            variant="outline"
                            size="sm"
                            className="mt-1 h-8 rounded-lg text-xs"
                            onClick={() => setShowCreate(true)}
                        >
                            <Plus className="size-3.5" />
                            新建索引
                        </Button>
                    </div>
                ) : (
                    visibleDocuments.map((item) => (
                        <KnowledgeRow
                            key={item.id}
                            item={item}
                            selected={selectedIds.includes(item.id)}
                            busy={busy}
                            onToggle={toggleSelected}
                            onReindex={handleReindex}
                            onView={handleView}
                            onDelete={handleDelete}
                        />
                    ))
                )}
            </div>

            {/* 分页 */}
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t bg-muted/40 px-4 py-2.5 text-xs text-muted-foreground">
                <div className="flex items-center gap-3">
                    <span>
                        共 {total} 条 · 第 {page}/{totalPages} 页
                    </span>
                    <Select
                        value={String(pageSize)}
                        onValueChange={(v) => {
                            setPageSize(Number(v));
                            setPage(1);
                        }}
                    >
                        <SelectTrigger className="h-7 w-max text-xs" aria-label="每页条数">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {PAGE_SIZE_OPTIONS.map((size) => (
                                <SelectItem key={size} value={String(size)}>
                                    每页 {size} 条
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <PaginationControls
                    page={page}
                    totalPages={totalPages}
                    onPageChange={setPage}
                    disabled={loading || busy}
                />
            </div>
        </div>
    );
}
