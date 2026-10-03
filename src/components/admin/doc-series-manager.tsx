"use client";

/**
 * 文档系列（静态外壳）：统计磁贴 + 关键词筛选 + 表格外壳 + 分页，全部动作按钮均为占位。
 *
 * ==== 接口情况（本次不接入，仅留档）====
 * - 远端资源 `/doc-series`：swagger 里有 `/doc-series`、`/doc-series/{id}`、`/doc-series/{id}/articles`；
 *   线上探活未登录返回 401（= 路径存在，只是需要登录）。
 * - 同源代理需另建 `/api/admin/doc-series`（本页暂不发任何请求）。
 * - 列表响应：`{ list, total, page, pageSize }`（⚠️ 是 `pageSize`，不是打赏那种 `page_size`）；
 *   列表查询参数建议 `keyword` / `page` / `pageSize`。
 * - 写接口：POST `/doc-series`、PUT `/doc-series/{id}`、DELETE `/doc-series/{id}`；
 *   「管理文档」对应 `/doc-series/{id}/articles`。
 *
 * 字段名与官方前端类型定义 `doc-series.ts` 的 DocSeries 完全对齐：
 *   name / description / cover_url / sort / doc_count / created_at / updated_at。
 *
 * 页面结构遵循后台列表页统一外壳：admin-card 内只有 admin-scroll 一个直系滚动子元素。
 */

import { useState } from "react";
import { toast } from "sonner";
import {
    BookMarked,
    FileText,
    Layers,
    Library,
    ListOrdered,
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
import { ACTION_TONE } from "@/lib/action-tones";
import { resolveAssetUrl } from "@/lib/utils";

/** 文档系列（官方 doc-series.ts: DocSeries，字段名一一对应） */
interface DocSeries {
    id: string;
    created_at: string;
    updated_at: string;
    name: string;
    description: string;
    cover_url: string;
    sort: number;
    doc_count: number;
}

/** 时间戳（YYYY-MM-DD HH:MM，本地时区） */
function formatDateTime(iso?: string): string {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 接口未接入时的数值占位 */
const PLACEHOLDER = "—";

/** 接口未接入：先用空列表渲染（行模板已按 DocSeries 字段写好） */
const SERIES: DocSeries[] = [];

/** 统计磁贴（接口接入后按远端列表口径填充） */
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

/** 单行模板：字段与 DocSeries 一一对应（当前列表为空，接口接入后由 list 渲染） */
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

/**
 * 文档系列页外壳：统计磁贴 + 关键词筛选 + 表格 + 分页。
 * 所有按钮均为占位（toast.info），本地 state 可输入但不过滤，不发任何网络请求。
 */
export function DocSeriesManager() {
    /** 关键词（本地 state，能输入但不过滤） */
    const [keyword, setKeyword] = useState("");

    const list = SERIES;
    const total = 0;
    const page = 1;
    const totalPages = Math.max(1, Math.ceil(total / 10));

    return (
        // admin-card：吃掉剩余高度，列表区域（admin-scroll）在卡片内部滚动，不再顶高整页
        <div className="admin-card">
            {/* 统计磁贴：固定在卡片顶部（shrink-0），不随列表滚动。数值等接口接入后才显示 */}
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
                            <p className="text-lg font-semibold tabular-nums text-muted-foreground">
                                {PLACEHOLDER}
                            </p>
                        </div>
                    </div>
                ))}
            </div>

            {/* 工具栏：固定在卡片顶部（shrink-0），不随下方列表滚动。
                左：关键词 + 重置；右：新增系列 / 刷新（全部占位） */}
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-muted/40 px-4 py-2.5">
                <div className="flex flex-1 flex-wrap items-center gap-2">
                    <div className="relative w-56">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={keyword}
                            onChange={(e) => setKeyword(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") toast.info("系列搜索待接入");
                            }}
                            placeholder="搜索系列名称 / 简介"
                            className="h-8 pl-8 pr-8 text-xs"
                            aria-label="搜索文档系列"
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

            {/* 列表：卡片内唯一滚动区（表头吸顶），工具栏与分页都不动 */}
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

                {list.length === 0 ? (
                    // 空态：图标 + 主文案 + 副文案 + 一个占位入口（接口未接入，列表恒为空）
                    <div className="flex min-h-64 flex-col items-center justify-center gap-2 px-4 py-12 text-center">
                        <span className="flex size-12 items-center justify-center rounded-full border bg-muted/60">
                            <BookMarked className="size-5 text-muted-foreground/60" />
                        </span>
                        <p className="text-sm font-medium text-foreground">暂无文档系列</p>
                        <p className="text-xs text-muted-foreground">接口接入后显示</p>
                        <Button
                            variant="outline"
                            size="sm"
                            className="mt-1 h-8 rounded-lg text-xs"
                            onClick={() => toast.info("新增系列待接入")}
                        >
                            <Plus className="size-3.5" />
                            新增系列
                        </Button>
                    </div>
                ) : (
                    list.map((item) => <DocSeriesRow key={item.id} item={item} />)
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
