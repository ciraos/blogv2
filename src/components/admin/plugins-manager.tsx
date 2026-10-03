"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
    Download,
    Package,
    Plug,
    Plus,
    Puzzle,
    RefreshCw,
    Settings,
    Trash2,
    ToggleLeft,
    X,
    type LucideIcon,
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

/* =============================================================================
 * 插件管理页（静态外壳，接口未接入）
 *
 * 接口现状（探活结论）：**未找到插件资源**
 *  - GET /plugins           → 404
 *  - GET /pro/admin/plugins → 404
 *  - swagger 里也没有该资源（既无列表、也无启用/禁用/安装/卸载端点）。
 *  - 因此本页字段全部**自定义**（见 PluginRow），后端接口定下来后对齐字段名即可；
 *    同源代理路由（如 /api/admin/plugins/*）也需在本仓库另建，建好前不做任何请求。
 *
 * 因此本文件：**零网络请求**（不 import lib/api、不 fetch），搜索/筛选全用本地 state，
 * 行数据写成空数组常量并保留完整的行渲染；所有按钮统一 toast 占位。
 * ========================================================================== */

/** 表格行：后端无该资源 → 字段按插件语义自定义 */
type PluginRow = {
    id: number;
    /** 插件标识（目录名 / slug） */
    slug: string;
    /** 插件名 */
    name: string;
    /** 一行简介 */
    description: string;
    /** 版本号，如 1.2.0 */
    version: string;
    /** 作者 / 维护者 */
    author: string;
    /** 是否启用（列表里用只读徽章展示） */
    enabled: boolean;
    /** 是否有新版本可更新 */
    has_update: boolean;
    /** 更新时间（ISO 字符串） */
    updated_at: string;
};

/**
 * 数据源占位：插件接口不存在 → 先空数组。
 * 行渲染已按字段写好，接口接入后把结果塞进这里即可，不用改 JSX。
 */
const PLUGINS: PluginRow[] = [];

/** 状态筛选 */
const STATUS_OPTIONS = [
    { value: "enabled", label: "已启用" },
    { value: "disabled", label: "已禁用" },
];

/** 时间戳（YYYY-MM-DD HH:MM，本地时区） */
function formatDateTime(iso?: string): string {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 统计磁贴：图标色块 + 标签 + 数值（数值待接口，统一渲染 `—`） */
function StatTile({
    icon: Icon,
    label,
    value,
    tone,
}: {
    icon: LucideIcon;
    label: string;
    value: string;
    tone: string;
}) {
    return (
        <div className="flex items-center gap-2.5 rounded-lg border bg-muted/40 px-3 py-2">
            <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${tone}`}>
                <Icon className="size-4" />
            </span>
            <div className="min-w-0">
                <p className="truncate text-xs text-muted-foreground">{label}</p>
                <p className="text-lg font-semibold tabular-nums text-muted-foreground/60">{value}</p>
            </div>
        </div>
    );
}

/**
 * 插件管理：统计磁贴 + 搜索/筛选工具栏 + 插件列表（占位）。
 * 远端无插件资源（/plugins、/pro/admin/plugins 探活 404，swagger 无），字段自定义；
 * 页面不滚、表格卡片内滚、表头吸顶。
 */
export function PluginsManager() {
    // 搜索/筛选全用本地 state（无请求）
    const [input, setInput] = useState("");
    const [keyword, setKeyword] = useState("");
    const [status, setStatus] = useState("all");

    /** 本地筛选（无请求）：接口接入后换成查询参数即可 */
    const rows = PLUGINS.filter((p) => {
        const kw = keyword.trim().toLowerCase();
        const matchKeyword =
            !kw ||
            p.name.toLowerCase().includes(kw) ||
            p.slug.toLowerCase().includes(kw) ||
            p.description.toLowerCase().includes(kw) ||
            p.author.toLowerCase().includes(kw);
        const matchStatus =
            status === "all" || (status === "enabled" ? p.enabled : !p.enabled);
        return matchKeyword && matchStatus;
    });

    const filtering = Boolean(keyword.trim()) || status !== "all";

    // 移动端(<640px)：grid-cols-1 把每个单元格竖排成卡片；≥640px：恢复表格式列布局。
    // min-w 只写在 sm: 以上 —— 窄屏若也撑宽，卡片就会被拉出横向滚动。
    const rowGrid = "sm:grid-cols-[minmax(0,1fr)_88px_120px_96px_128px_136px]";
    const rowMinW = "sm:min-w-[920px]";

    return (
        <div className="admin-card">
            {/* 统计磁贴：固定在卡片顶部（shrink-0），不随列表滚动 */}
            <div className="grid shrink-0 grid-cols-2 gap-2 border-b p-3 md:grid-cols-4">
                <StatTile
                    icon={Package}
                    label="已安装"
                    value="—"
                    tone="bg-blue-500/10 text-blue-600 dark:text-blue-400"
                />
                <StatTile
                    icon={Plug}
                    label="已启用"
                    value="—"
                    tone="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                />
                <StatTile
                    icon={Download}
                    label="待更新"
                    value="—"
                    tone="bg-amber-500/10 text-amber-600 dark:text-amber-400"
                />
                <StatTile
                    icon={Puzzle}
                    label="总数"
                    value="—"
                    tone="bg-violet-500/10 text-violet-600 dark:text-violet-400"
                />
            </div>

            {/* 工具栏：固定在卡片顶部（shrink-0），不随下方列表滚动 */}
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b bg-muted/40 px-4 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                    {/* 搜索：输入即筛（本地 state，无请求） */}
                    <div className="relative w-52">
                        <Input
                            value={input}
                            onChange={(e) => {
                                setInput(e.target.value);
                                setKeyword(e.target.value);
                            }}
                            placeholder="搜索插件名称、简介、作者"
                            className="h-7 pr-7 text-xs"
                            aria-label="搜索插件"
                        />
                        {input && (
                            <button
                                type="button"
                                onClick={() => {
                                    setInput("");
                                    setKeyword("");
                                }}
                                aria-label="清空搜索"
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>

                    {/* 状态筛选 */}
                    <Select value={status} onValueChange={setStatus}>
                        <SelectTrigger className="h-7 w-26 shrink-0 text-xs" aria-label="状态筛选">
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

                    <span className="text-xs text-muted-foreground">
                        共 <span className="font-medium text-foreground">{rows.length || "—"}</span> 个插件
                    </span>
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        size="sm"
                        className="h-7 px-2 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
                        onClick={() => toast.info("安装插件待接入")}
                    >
                        <Plus className="size-3.5" />
                        安装插件
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => toast.info("刷新待接入")}
                    >
                        <RefreshCw className="size-3.5" />
                        刷新
                    </Button>
                </div>
            </div>

            {/* 列表：卡片内唯一滚动区（表头吸顶），磁贴/工具栏/分页都不动 */}
            <div className="admin-scroll">
                {/* 表头：移动端隐藏（卡片自带行内信息即可读懂），≥sm 才以 grid 显示 */}
                <div
                    className={`admin-sticky-head hidden items-center gap-3 border-b px-4 py-2.5 text-xs font-medium text-muted-foreground sm:grid ${rowMinW} ${rowGrid}`}
                >
                    <span>插件</span>
                    <span>版本</span>
                    <span>作者</span>
                    <span>状态</span>
                    <span>更新时间</span>
                    <span className="text-right">操作</span>
                </div>

                {rows.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-1.5 py-12 text-sm text-muted-foreground">
                        <Puzzle className="size-5 opacity-60" />
                        <span>{filtering ? "没有匹配的插件" : "暂无插件"}</span>
                        <span className="text-xs text-muted-foreground/70">接口接入后显示</span>
                    </div>
                ) : (
                    rows.map((p) => (
                        <div
                            key={p.id}
                            className={`grid grid-cols-1 items-center gap-x-3 gap-y-2 border-b px-4 py-3 text-sm transition-colors last:border-b-0 hover:bg-muted/40 sm:gap-y-1 ${rowMinW} ${rowGrid}`}
                        >
                            {/* 插件：图标 + 名称 + 一行简介 */}
                            <div className="flex items-start gap-2">
                                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                                    <Puzzle className="size-4" />
                                </span>
                                <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                        <span className="truncate font-medium text-foreground">{p.name || p.slug}</span>
                                        {p.has_update && (
                                            <span className="shrink-0 rounded-full bg-amber-500/15 px-1.5 py-px text-[11px] font-medium text-amber-600 dark:text-amber-400">
                                                有更新
                                            </span>
                                        )}
                                    </div>
                                    <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                                        {p.description || "—"}
                                    </div>
                                </div>
                            </div>
                            <div className="text-xs tabular-nums text-muted-foreground">
                                <span className="mr-1 sm:hidden">版本</span>
                                {p.version || "—"}
                            </div>
                            <div className="truncate text-xs text-muted-foreground" title={p.author}>
                                {/* 作者名脱离表头不知是谁，窄屏补个前缀 */}
                                <span className="mr-1 sm:hidden">作者</span>
                                {p.author || "—"}
                            </div>
                            {/* 状态：只读展示（后端无插件接口，先不做可点开关） */}
                            <div>
                                <span
                                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                                        p.enabled
                                            ? "bg-green-500/15 text-green-600 dark:text-green-400"
                                            : "bg-muted text-muted-foreground"
                                    }`}
                                >
                                    <span
                                        className={`size-1.5 rounded-full ${p.enabled ? "bg-green-500" : "bg-muted-foreground/60"}`}
                                    />
                                    {p.enabled ? "已启用" : "已禁用"}
                                </span>
                            </div>
                            <div className="text-xs text-muted-foreground">{formatDateTime(p.updated_at)}</div>
                            <div className="flex items-center gap-1 sm:justify-end">
                                <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label={p.enabled ? "禁用" : "启用"}
                                    title={p.enabled ? "禁用" : "启用"}
                                    className={p.enabled ? ACTION_TONE.block : ACTION_TONE.approve}
                                    onClick={() => toast.info(p.enabled ? "禁用插件待接入" : "启用插件待接入")}
                                >
                                    {p.enabled ? <ToggleLeft className="size-4" /> : <Plug className="size-4" />}
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label="设置"
                                    title="设置"
                                    className={ACTION_TONE.edit}
                                    onClick={() => toast.info("插件设置待接入")}
                                >
                                    <Settings className="size-4" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label="卸载"
                                    title="卸载"
                                    className={ACTION_TONE.delete}
                                    onClick={() => toast.info("卸载插件待接入")}
                                >
                                    <Trash2 className="size-4" />
                                </Button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* 分页：固定在卡片底部（接口未接入 → 禁用），不随列表滚动 */}
            <div className="flex shrink-0 items-center justify-between gap-3 border-t bg-muted/40 px-4 py-2.5 text-xs text-muted-foreground">
                <span>第 1 / 1 页</span>
                <PaginationControls
                    page={1}
                    totalPages={1}
                    onPageChange={() => toast.info("分页待接入")}
                    disabled
                />
            </div>
        </div>
    );
}
