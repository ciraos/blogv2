"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
    BadgeCheck,
    CheckCircle2,
    Download,
    Package,
    Palette,
    RefreshCw,
    Search,
    Settings,
    Sparkles,
    Star,
    Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PaginationControls } from "@/components/pagination-controls";
import { cn } from "@/lib/utils";
import { ACTION_TONE } from "@/lib/action-tones";

/**
 * 主题商城页 —— 纯静态外壳（接口先不接）。
 *
 * 接口来源（官方 theme-mall.ts / swagger，远端 `/theme/*` 共 13 个）：
 *  - GET  /theme/installed            已安装主题（响应 { list, total }）
 *  - GET  /theme/official             官方主题
 *  - GET  /theme/current              当前主题
 *  - POST /theme/switch               应用主题
 *  - POST /theme/install              安装
 *  - POST /theme/uninstall            卸载
 *  - POST /theme/settings             主题设置
 *  - POST /theme/upload               上传主题
 *  - POST /theme/validate             校验主题包
 *  - （其余：市场列表 / 详情 / 更新等）
 * 同源代理需另建（本轮不接）。
 *
 * 本轮约定：不发起任何网络请求；按钮一律 toast.info("…待接入")；
 * 搜索 / Tab / 分页为本地 state；数据源是空数组常量，卡片按字段写好。
 */

const PAGE_SIZE = 12;

/** 官方 Theme.themeType / deployType / ssrStatus → 中文 */
const THEME_TYPE_LABEL: Record<string, string> = {
    community: "社区主题",
    pro: "Pro 主题",
};

const DEPLOY_TYPE_LABEL: Record<string, string> = {
    standard: "标准版",
    ssr: "SSR 版",
};

const SSR_STATUS_LABEL: Record<string, string> = {
    not_installed: "未安装",
    installed: "已安装",
    running: "运行中",
    error: "异常",
};

/** 官方 Theme（字段名严格对齐 theme-mall.ts） */
interface Theme {
    id?: number;
    name?: string;
    author?: string;
    description?: string;
    themeType?: "community" | "pro" | string;
    deployType?: "standard" | "ssr" | string;
    version?: string;
    price?: number | string;
    previewUrl?: string;
    demoUrl?: string;
    downloadCount?: number;
    rating?: number;
    isOfficial?: boolean;
    isActive?: boolean;
    is_current?: boolean;
    is_installed?: boolean;
    installed_version?: string;
    ssrStatus?: "not_installed" | "installed" | "running" | "error" | string;
}

/** 数据源占位：接接口后分别由 GET /theme/installed、市场列表填充 */
const INSTALLED_THEMES: Theme[] = [];
const MARKET_THEMES: Theme[] = [];

const themeTypeLabel = (type?: string) => THEME_TYPE_LABEL[type ?? ""] ?? "主题";

/** 价格：0 / 空 → 免费 */
function formatPrice(price?: number | string): string {
    const n = Number(price);
    if (!Number.isFinite(n) || n <= 0) return "免费";
    return `¥${n.toFixed(2)}`;
}

/** 下载量：万级缩写 */
function formatCount(count?: number): string {
    const n = Number(count);
    if (!Number.isFinite(n) || n <= 0) return "0";
    if (n >= 10000) return `${(n / 10000).toFixed(1)} 万`;
    return String(n);
}

/** 评分：一位小数 */
function formatRating(rating?: number): string {
    const n = Number(rating);
    return Number.isFinite(n) && n > 0 ? n.toFixed(1) : "—";
}

/** 状态徽章：当前使用 / 已安装 / 未安装（SSR 主题额外带上运行状态） */
function statusBadge(theme: Theme): { label: string; cls: string } {
    if (theme.is_current) {
        return {
            label: "当前使用",
            cls: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400",
        };
    }
    if (theme.is_installed) {
        return {
            label: "已安装",
            cls: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
        };
    }
    return { label: "未安装", cls: "bg-muted text-muted-foreground" };
}

/**
 * 主题商城页：统计磁贴 + 两个 Tab（已安装 / 主题市场）+ 卡片网格 + 分页。
 * 外壳对齐相册 / 打赏管理：页面不滚，磁贴 / Tab / 分页固定在卡片上，只有网格区（admin-scroll）内部滚动。
 */
export function ThemesManager() {
    const [tab, setTab] = useState<"installed" | "market">("installed");
    const [keyword, setKeyword] = useState("");
    const [page, setPage] = useState(1);

    const installed = INSTALLED_THEMES;
    const market = MARKET_THEMES;
    const source = tab === "installed" ? installed : market;
    const total = source.length;
    const loading = false;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    /** 磁贴（接接口后由已安装 / 市场列表聚合） */
    const tiles = useMemo(
        () => [
            { label: "已安装", value: "—", icon: Package },
            { label: "官方主题", value: "—", icon: BadgeCheck },
            { label: "社区主题", value: "—", icon: Palette },
            { label: "当前主题", value: "—", icon: Sparkles },
        ],
        []
    );

    const hasFilter = keyword.trim() !== "";

    /** 本地搜索（接口接入后作为请求参数） */
    const list = useMemo(() => {
        const kw = keyword.trim().toLowerCase();
        if (!kw) return source;
        return source.filter((t) =>
            [t.name, t.author, t.description].some((v) => (v ?? "").toLowerCase().includes(kw))
        );
    }, [source, keyword]);

    return (
        <div className="admin-card">
            {/* 统计磁贴：固定在卡片顶部（shrink-0），不随内容滚动 */}
            <div className="grid shrink-0 grid-cols-2 gap-2 border-b p-3 md:grid-cols-4">
                {tiles.map((t) => (
                    <div key={t.label} className="flex items-start justify-between gap-2 rounded-lg border bg-muted/40 px-3 py-2">
                        <div>
                            <p className="text-xs text-muted-foreground">{t.label}</p>
                            <p className="text-lg font-semibold tabular-nums">{t.value}</p>
                        </div>
                        <t.icon className="size-4 shrink-0 text-muted-foreground/60" />
                    </div>
                ))}
            </div>

            {/* Tab + 工具：固定在卡片顶部（shrink-0），不随网格滚动 */}
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b bg-muted/40 px-4 py-2.5">
                <div className="flex items-center overflow-hidden rounded-xl border bg-card shadow-sm">
                    {(
                        [
                            { key: "installed", label: "已安装", icon: Package },
                            { key: "market", label: "主题市场", icon: Palette },
                        ] as const
                    ).map((t, i) => (
                        <span key={t.key} className="flex items-center">
                            {i > 0 && <span className="h-5 w-px bg-border" />}
                            <button
                                type="button"
                                onClick={() => {
                                    setTab(t.key);
                                    setPage(1);
                                }}
                                className={cn(
                                    "flex h-9 items-center gap-1.5 px-3 text-xs transition-colors",
                                    tab === t.key
                                        ? "bg-primary/10 text-primary"
                                        : "text-muted-foreground hover:text-primary"
                                )}
                            >
                                <t.icon className="size-3.5" />
                                {t.label}
                            </button>
                        </span>
                    ))}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                        共 <span className="font-medium text-foreground">{total}</span> 个
                        {tab === "installed" ? "已安装主题" : "市场主题"}
                    </span>
                    <div className="relative">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={keyword}
                            onChange={(e) => {
                                setKeyword(e.target.value);
                                setPage(1);
                            }}
                            placeholder="搜索主题名称 / 作者…"
                            className="h-7 w-44 pl-8 text-xs sm:w-56"
                        />
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => toast.info("刷新主题列表待接入")}
                    >
                        <RefreshCw className="size-3.5" />
                        刷新
                    </Button>
                </div>
            </div>

            {/* 内容：卡片内唯一滚动区（网格上方的窄条吸顶），Tab 与分页都不动 */}
            <div className="admin-scroll">
                <div className="admin-sticky-head flex items-center justify-between gap-2 border-b px-4 py-2.5 text-xs text-muted-foreground">
                    <span>
                        {tab === "installed" ? "已安装主题" : "主题市场"}
                        <span className="ml-2 text-muted-foreground/70">
                            （接口接入后显示）
                        </span>
                    </span>
                    {hasFilter && <span>匹配 {list.length} 个</span>}
                </div>

                {loading ? (
                    <div className="py-12 text-center text-sm text-muted-foreground">加载中…</div>
                ) : list.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-1.5 py-12 text-sm text-muted-foreground">
                        <Palette className="size-5 opacity-60" />
                        <span>{hasFilter ? "没有匹配的主题" : tab === "installed" ? "暂无已安装主题" : "主题市场暂无数据"}</span>
                        <span className="text-xs text-muted-foreground/70">接口接入后显示</span>
                    </div>
                ) : (
                    // 移动端(<640px)：grid-cols-1 卡片竖排；≥640px 起按屏宽铺开。
                    // min-w 只写在 sm: 以上，窄屏不会被撑出横向滚动。
                    <div className="grid grid-cols-1 gap-3 p-3 sm:min-w-[620px] sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                        {list.map((theme, index) => {
                            const badge = statusBadge(theme);
                            return (
                                <div
                                    key={theme.id ?? `${theme.name}-${index}`}
                                    className="group flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary hover:shadow-md"
                                >
                                    {/* 预览图：previewUrl 为空时用主题色渐变占位 */}
                                    <div className="relative flex aspect-16/10 w-full items-center justify-center overflow-hidden bg-gradient-to-br from-primary/15 via-muted to-muted">
                                        {theme.previewUrl ? (
                                            // 注释必须放在 JSX 子元素位置：用 Fragment 包一层，
                                            // 否则 {/* … */} 出现在三元分支里会直接语法错误
                                            <>
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img
                                                    src={theme.previewUrl}
                                                    alt={theme.name || "主题预览图"}
                                                    loading="lazy"
                                                    className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                                                />
                                            </>
                                        ) : (
                                            <Palette className="size-8 text-muted-foreground/40" />
                                        )}
                                        <span className="absolute right-2 top-2 flex flex-wrap items-center gap-1">
                                            {theme.isOfficial && (
                                                <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground">
                                                    官方
                                                </span>
                                            )}
                                            {theme.themeType === "pro" && (
                                                <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-medium text-white">
                                                    Pro
                                                </span>
                                            )}
                                        </span>
                                    </div>

                                    {/* 卡片正文 */}
                                    <div className="flex flex-1 flex-col gap-2 p-3">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <div className="truncate font-medium text-foreground">
                                                    {theme.name || "—"}
                                                </div>
                                                <div className="mt-0.5 truncate text-xs text-muted-foreground">
                                                    {theme.author ? `by ${theme.author}` : "—"}
                                                </div>
                                            </div>
                                            <span
                                                className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}
                                            >
                                                {badge.label}
                                            </span>
                                        </div>

                                        <p className="line-clamp-2 min-h-8 text-xs leading-relaxed text-muted-foreground">
                                            {theme.description || "暂无简介"}
                                        </p>

                                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                            <span className="rounded-md bg-muted px-1.5 py-0.5">
                                                {themeTypeLabel(theme.themeType)}
                                            </span>
                                            <span className="rounded-md bg-muted px-1.5 py-0.5">
                                                {DEPLOY_TYPE_LABEL[theme.deployType ?? ""] ?? "—"}
                                            </span>
                                            <span className="tabular-nums">v{theme.version || "—"}</span>
                                            <span className="font-medium text-foreground">
                                                {formatPrice(theme.price)}
                                            </span>
                                        </div>

                                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                            <span className="inline-flex items-center gap-1 tabular-nums">
                                                <Download className="size-3.5" />
                                                {formatCount(theme.downloadCount)}
                                            </span>
                                            <span className="inline-flex items-center gap-1 tabular-nums">
                                                <Star className="size-3.5" />
                                                {formatRating(theme.rating)}
                                            </span>
                                            {theme.deployType === "ssr" && (
                                                <span className="inline-flex items-center gap-1">
                                                    <CheckCircle2 className="size-3.5" />
                                                    {SSR_STATUS_LABEL[theme.ssrStatus ?? ""] ?? "未安装"}
                                                </span>
                                            )}
                                            {theme.is_installed && theme.installed_version && (
                                                <span className="tabular-nums">
                                                    已装 v{theme.installed_version}
                                                </span>
                                            )}
                                        </div>

                                        {/* 操作：全部占位 */}
                                        <div className="mt-auto flex flex-wrap items-center gap-2 border-t pt-2">
                                            {theme.is_installed ? (
                                                <>
                                                    <Button
                                                        size="sm"
                                                        className="h-7 px-2 text-xs"
                                                        disabled={theme.is_current}
                                                        onClick={() => toast.info("应用主题待接入")}
                                                    >
                                                        <Sparkles className="size-3.5" />
                                                        {theme.is_current ? "使用中" : "应用主题"}
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className={cn("h-7 px-2 text-xs", ACTION_TONE.edit)}
                                                        onClick={() => toast.info("主题设置待接入")}
                                                    >
                                                        <Settings className="size-3.5" />
                                                        设置
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        disabled={theme.is_current}
                                                        className={cn("h-7 px-2 text-xs", ACTION_TONE.delete)}
                                                        onClick={() => toast.info("卸载主题待接入")}
                                                    >
                                                        <Trash2 className="size-3.5" />
                                                        卸载
                                                    </Button>
                                                </>
                                            ) : (
                                                <>
                                                    <Button
                                                        size="sm"
                                                        className="h-7 px-2 text-xs"
                                                        onClick={() => toast.info("安装主题待接入")}
                                                    >
                                                        <Download className="size-3.5" />
                                                        安装
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="h-7 px-2 text-xs"
                                                        onClick={() => toast.info("主题详情待接入")}
                                                    >
                                                        详情
                                                    </Button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* 分页：固定在卡片底部，不随网格滚动 */}
            <div className="flex shrink-0 items-center justify-between gap-3 border-t bg-muted/40 px-4 py-2.5 text-xs text-muted-foreground">
                <span>
                    第 {page} / {totalPages} 页
                    <span className="ml-2 text-muted-foreground/70">（接口接入后启用分页）</span>
                </span>
                <PaginationControls page={page} totalPages={totalPages} onPageChange={setPage} disabled />
            </div>
        </div>
    );
}
