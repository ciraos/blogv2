"use client";

/**
 * 知识库管理（静态外壳）：统计磁贴 + 状态/关键词筛选 + 表格外壳 + 分页，全部动作按钮均为占位。
 *
 * ==== 接口情况（本次不接入，仅留档）====
 * - **未找到可用接口**：对 `/knowledge`、`/pro/admin/knowledge` 等路径线上探活均返回 404，
 *   swagger 里也没有该资源（对比同环境的 `/doc-series` 未登录返回 401 = 存在）。
 *   所以本页**不发任何网络请求**：磁贴数值一律「—」，列表恒为空态，分页保持禁用。
 * - 官方前端（theme-anheyu-next-main/src/lib/api/knowledge.ts）调用的是
 *   `/api/pro/admin/knowledge` 下的：`/documents`（列表）、`/documents/{id}`、`/documents/{id}/reindex`、
 *   `/documents/batch`（批量删除）、`/stats`、`/config`、`/sync-articles`、`/upload`、`/clear`、`/supported-types`。
 *   接入时可先照这套路径建同源代理，但需后端先开放该模块。
 * - 列表响应形如 `{ documents, total, page, page_size }`（官方类型 ListKnowledgeDocumentsResponse），
 *   ⚠️ 顶层键是 `documents` / `page_size`，与打赏、文档系列那套 `{ list, pageSize }` 不同。
 *
 * 字段名与官方前端类型定义 `knowledge.ts` 对齐：
 *   - KnowledgeDocument：title / source_type(article|upload|custom|webpage) /
 *     content_type / content_length / status(pending|processing|indexed|failed|disabled) /
 *     chunk_count / indexed_at / created_at / error_message
 *   - KnowledgeStats：total_documents / indexed_documents / pending_documents /
 *     failed_documents / total_chunks / total_tokens
 *
 * 页面结构遵循后台列表页统一外壳：admin-card 内只有 admin-scroll 一个直系滚动子元素。
 */

import { useState } from "react";
import { toast } from "sonner";
import {
    Blocks,
    Database,
    BadgeCheck,
    Clock,
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

/** 索引状态（knowledge.ts: KnowledgeDocumentStatus） */
type KnowledgeDocumentStatus = "pending" | "processing" | "indexed" | "failed" | "disabled";

/** 来源类型（knowledge.ts: KnowledgeSourceType） */
type KnowledgeSourceType = "article" | "upload" | "custom" | "webpage";

/** 知识库文档（knowledge.ts: KnowledgeDocument） */
interface KnowledgeDocument {
    id: number;
    source_type: KnowledgeSourceType;
    source_id?: number;
    source_url?: string;
    title: string;
    content_type: string;
    content_length: number;
    status: KnowledgeDocumentStatus;
    chunk_count: number;
    error_message?: string;
    indexed_at?: string;
    created_at: string;
    updated_at: string;
}

/** 状态徽章（KnowledgeDocumentStatus，中文文案） */
const STATUS_META: Record<KnowledgeDocumentStatus, { label: string; cls: string }> = {
    pending: { label: "待处理", cls: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400" },
    processing: { label: "处理中", cls: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400" },
    indexed: { label: "已索引", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400" },
    failed: { label: "失败", cls: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400" },
    disabled: { label: "已禁用", cls: "bg-muted text-muted-foreground" },
};

/** 状态筛选项 */
const STATUS_OPTIONS: { value: KnowledgeDocumentStatus; label: string }[] = [
    { value: "pending", label: "待处理" },
    { value: "processing", label: "处理中" },
    { value: "indexed", label: "已索引" },
    { value: "failed", label: "失败" },
    { value: "disabled", label: "已禁用" },
];

/** 来源徽章（KnowledgeSourceType，中文文案） */
const SOURCE_META: Record<KnowledgeSourceType, { label: string; cls: string }> = {
    article: { label: "文章", cls: "bg-sky-500/15 text-sky-600 dark:text-sky-400" },
    upload: { label: "上传", cls: "bg-violet-500/15 text-violet-600 dark:text-violet-400" },
    custom: { label: "自定义", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
    webpage: { label: "网页", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
};

/** 时间戳（YYYY-MM-DD HH:MM，本地时区） */
function formatDateTime(iso?: string): string {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * 内容大小：按字节估算展示（<1KB 显示 B，<1MB 显示 KB，其余 MB）。
 * content_length 的真实单位（字节 / 字符）待接口确认后再校准。
 */
function formatSize(value?: number): string {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return "0 B";
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** 接口未接入时的数值占位 */
const PLACEHOLDER = "—";

/** 接口未接入：先用空列表渲染（行模板已按 KnowledgeDocument 字段写好） */
const DOCUMENTS: KnowledgeDocument[] = [];

/** 统计磁贴：口径照官方 KnowledgeStats，数值等接口接入后才显示 */
const STAT_TILES = [
    { key: "total", label: "文档总数", icon: Database, chip: "bg-primary/10 text-primary" },
    {
        key: "indexed",
        label: "已索引",
        icon: BadgeCheck,
        chip: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    },
    {
        key: "pending",
        label: "待处理",
        icon: Clock,
        chip: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    },
    {
        key: "failed",
        label: "失败",
        icon: TriangleAlert,
        chip: "bg-red-500/10 text-red-600 dark:text-red-400",
    },
    {
        key: "chunks",
        label: "总分块",
        icon: Blocks,
        chip: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
    },
    {
        key: "tokens",
        label: "总 Token",
        icon: Hash,
        chip: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    },
] as const;

// 移动端(<640px)：grid-cols-1 把每个单元格竖排成卡片；≥640px：恢复表格式列布局。
// min-w 只写在 sm: 以上 —— 窄屏若也撑宽，卡片就会被拉出横向滚动。
// 表头与数据行共用这套列宽，列顺序：标题 / 来源 / 类型 / 大小 / 状态 / 分块 / 索引时间 / 创建时间 / 操作
const rowGrid =
    "sm:grid-cols-[minmax(0,1fr)_72px_104px_80px_88px_64px_140px_140px_128px]";
const rowMinW = "sm:min-w-[1120px]";

/** 单行模板：字段与 KnowledgeDocument 一一对应（当前列表为空，接口接入后由 list 渲染） */
function KnowledgeRow({ item }: { item: KnowledgeDocument }) {
    const status = STATUS_META[item.status] ?? { label: String(item.status), cls: "bg-muted text-muted-foreground" };
    const source = SOURCE_META[item.source_type] ?? {
        label: String(item.source_type),
        cls: "bg-muted text-muted-foreground",
    };
    return (
        <div
            className={`grid grid-cols-1 items-center gap-x-3 gap-y-2 border-b px-4 py-3 text-sm transition-colors last:border-b-0 hover:bg-muted/40 sm:gap-y-1 ${rowMinW} ${rowGrid}`}
        >
            {/* 标题：title（失败时补一行 error_message） */}
            <div className="flex min-w-0 items-start gap-2">
                <FileSearch className="mt-0.5 size-4 shrink-0 text-muted-foreground/60" />
                <div className="min-w-0">
                    <div className="line-clamp-1 font-medium text-foreground">{item.title || PLACEHOLDER}</div>
                    {item.status === "failed" && item.error_message && (
                        <div className="line-clamp-1 text-xs text-red-600 dark:text-red-400">
                            {item.error_message}
                        </div>
                    )}
                </div>
            </div>
            {/* 来源：source_type */}
            <div>
                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${source.cls}`}>
                    {source.label}
                </span>
            </div>
            {/* 类型：content_type（如 text/markdown） */}
            <div className="truncate font-mono text-xs text-muted-foreground">
                <span className="mr-1 font-sans sm:hidden">类型</span>
                {item.content_type || PLACEHOLDER}
            </div>
            {/* 大小：content_length */}
            <div className="text-xs tabular-nums text-muted-foreground sm:text-right">
                <span className="mr-1 sm:hidden">大小</span>
                {formatSize(item.content_length)}
            </div>
            {/* 状态：status */}
            <div className="sm:text-center">
                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${status.cls}`}>
                    {status.label}
                </span>
            </div>
            {/* 分块：chunk_count */}
            <div className="text-xs tabular-nums text-muted-foreground sm:text-center">
                {/* 裸数字脱离表头看不懂，窄屏补个前缀 */}
                <span className="mr-1 sm:hidden">分块</span>
                {item.chunk_count ?? 0}
            </div>
            {/* 索引时间：indexed_at（未索引显示「—」） */}
            <div className="text-xs text-muted-foreground">
                <span className="mr-1 sm:hidden">索引</span>
                {formatDateTime(item.indexed_at)}
            </div>
            {/* 创建时间：created_at */}
            <div className="text-xs text-muted-foreground">
                <span className="mr-1 sm:hidden">创建</span>
                {formatDateTime(item.created_at)}
            </div>
            {/* 操作列：重新索引 / 查看 / 删除，全部占位 */}
            <div className="flex items-center gap-1 sm:justify-end">
                <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="重新索引"
                    title="重新索引"
                    className={ACTION_TONE.key}
                    onClick={() => toast.info("重新索引待接入")}
                >
                    <RefreshCw className="size-4" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="查看"
                    title="查看文档"
                    className={ACTION_TONE.view}
                    onClick={() => toast.info("查看文档待接入")}
                >
                    <Eye className="size-4" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="删除"
                    title="删除"
                    className={ACTION_TONE.delete}
                    onClick={() => toast.info("删除文档待接入")}
                >
                    <Trash2 className="size-4" />
                </Button>
            </div>
        </div>
    );
}

/**
 * 知识库管理页外壳：统计磁贴 + 状态/关键词筛选 + 表格 + 分页。
 * 所有按钮均为占位（toast.info），本地 state 可输入但不过滤，不发任何网络请求。
 */
export function KnowledgeManager() {
    /** 状态筛选（本地 state，能打开但不过滤） */
    const [statusFilter, setStatusFilter] = useState("");
    /** 关键词（本地 state，能输入但不过滤） */
    const [keyword, setKeyword] = useState("");

    const list = DOCUMENTS;
    const total = 0;
    const page = 1;
    const totalPages = Math.max(1, Math.ceil(total / 10));

    /** 重置筛选（只清本地 state，不发请求） */
    const resetFilters = () => {
        setStatusFilter("");
        setKeyword("");
    };

    return (
        // admin-card：吃掉剩余高度，列表区域（admin-scroll）在卡片内部滚动，不再顶高整页
        <div className="admin-card">
            {/* 统计磁贴：固定在卡片顶部（shrink-0），不随列表滚动。数值等接口接入后才显示 */}
            <div className="grid shrink-0 grid-cols-2 gap-2 border-b p-3 md:grid-cols-3 xl:grid-cols-6">
                {STAT_TILES.map((tile) => (
                    <div key={tile.key} className="flex items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2">
                        <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${tile.chip}`}>
                            <tile.icon className="size-4" />
                        </span>
                        <div className="min-w-0">
                            <p className="truncate text-xs text-muted-foreground">{tile.label}</p>
                            <p className="text-lg font-semibold tabular-nums text-muted-foreground">
                                {PLACEHOLDER}
                            </p>
                        </div>
                    </div>
                ))}
            </div>

            {/* 工具栏：固定在卡片顶部（shrink-0），不随下方列表滚动。
                左：关键词 + 状态 + 重置；右：同步文章 / 新建索引 / 刷新（全部占位） */}
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-muted/40 px-4 py-2.5">
                <div className="flex flex-1 flex-wrap items-center gap-2">
                    <div className="relative w-56">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={keyword}
                            onChange={(e) => setKeyword(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") toast.info("知识库搜索待接入");
                            }}
                            placeholder="搜索文档标题 / 内容类型"
                            className="h-8 pl-8 pr-8 text-xs"
                            aria-label="搜索知识库文档"
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

                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        状态
                        <Select
                            value={statusFilter || "all"}
                            onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}
                        >
                            <SelectTrigger className="h-7 w-max text-xs">
                                <SelectValue placeholder="全部" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">全部</SelectItem>
                                {STATUS_OPTIONS.map((o) => (
                                    <SelectItem key={o.value} value={o.value}>
                                        {o.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={resetFilters}
                    >
                        <RotateCcw className="size-3.5" />
                        重置
                    </Button>

                    <span className="text-xs text-muted-foreground">
                        共 <span className="font-medium text-foreground">{total}</span> 篇文档
                    </span>
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() => toast.info("同步文章待接入")}
                    >
                        <Sparkles className="size-3.5" />
                        同步文章
                    </Button>
                    <Button
                        size="sm"
                        className="h-8 bg-primary text-primary-foreground hover:bg-primary/90"
                        onClick={() => toast.info("新建索引待接入")}
                    >
                        <Plus className="size-3.5" />
                        新建索引
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

            {/* 列表：卡片内唯一滚动区（表头吸顶），工具栏与分页都不动 */}
            <div className="admin-scroll">
                {/* 表头：移动端隐藏（卡片自带行内信息即可读懂），≥sm 才以 grid 显示 */}
                <div
                    className={`admin-sticky-head hidden items-center gap-3 border-b px-4 py-2.5 text-xs font-medium text-muted-foreground sm:grid ${rowMinW} ${rowGrid}`}
                >
                    <span>标题</span>
                    <span>来源</span>
                    <span>类型</span>
                    <span className="text-right">大小</span>
                    <span className="text-center">状态</span>
                    <span className="text-center">分块</span>
                    <span>索引时间</span>
                    <span>创建时间</span>
                    <span className="text-right">操作</span>
                </div>

                {list.length === 0 ? (
                    // 空态：图标 + 主文案 + 副文案 + 一个占位入口（后端无该接口，列表恒为空）
                    <div className="flex min-h-64 flex-col items-center justify-center gap-2 px-4 py-12 text-center">
                        <span className="flex size-12 items-center justify-center rounded-full border bg-muted/60">
                            <FileSearch className="size-5 text-muted-foreground/60" />
                        </span>
                        <p className="text-sm font-medium text-foreground">暂无知识库文档</p>
                        <p className="text-xs text-muted-foreground">接口接入后显示</p>
                        <Button
                            variant="outline"
                            size="sm"
                            className="mt-1 h-8 rounded-lg text-xs"
                            onClick={() => toast.info("新建索引待接入")}
                        >
                            <Plus className="size-3.5" />
                            新建索引
                        </Button>
                    </div>
                ) : (
                    list.map((item) => <KnowledgeRow key={item.id} item={item} />)
                )}
            </div>

            {/* 分页：固定在卡片底部，不随列表滚动；无数据时展示 0 条并禁用 */}
            <div className="flex shrink-0 items-center justify-between gap-3 border-t bg-muted/40 px-4 py-2.5 text-xs text-muted-foreground">
                <span>
                    共 {total} 条 · 第 {page}/{totalPages} 页
                </span>
                <PaginationControls page={page} totalPages={totalPages} onPageChange={() => {}} disabled />
            </div>
        </div>
    );
}
