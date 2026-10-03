"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
    BadgeCheck,
    CheckCircle2,
    Download,
    Loader2,
    Package,
    Palette,
    RefreshCw,
    Search,
    Settings,
    Sparkles,
    Star,
    Trash2,
    TriangleAlert,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PaginationControls } from "@/components/pagination-controls";
import { cn, resolveAssetUrl } from "@/lib/utils";
import { ACTION_TONE } from "@/lib/action-tones";
import { getAdminInstalledThemesApi, getAdminOfficialThemesApi } from "@/lib/api";
import { DEPLOY_TYPE_LABEL, SSR_STATUS_LABEL, THEME_TYPE_LABEL } from "@/types/themes";
import type { Theme, ThemeListData } from "@/types/themes";

/**
 * 主题商城页：统计磁贴 + 两个 Tab（已安装 / 主题市场）+ 卡片网格 + 分页。
 *
 * 数据源（本轮只做「读」）：
 *  - GET /api/admin/themes/installed → 远端 /theme/installed（已安装主题）
 *  - GET /api/admin/themes/official  → 远端 /theme/official（主题市场 / 官方主题）
 *    ⚠️ 线上探活：/theme/official 目前返回 404（后端尚未提供该路由），
 *    所以「主题市场」Tab 会走错误态：toast.error + 卡片区内可重试的提示，不白屏、不崩。
 *    两个接口都无分页参数，响应形状均为 { list, total }（见 @/types/themes）。
 *
 * 加载策略：Tab 各自独立请求，切到哪个 Tab 才拉哪个（懒加载），已加载过的不重复请求；
 * 「刷新」按钮强制重拉当前 Tab（并清掉它的请求去重缓存）。
 * 搜索仍是本地过滤（接口没有 keyword 参数）；分页按本地过滤结果切片（每页 12）。
 *
 * 写操作（应用主题 / 安装 / 卸载 / 设置 / 详情）本轮一律 toast.info("…待接入")。
 */

const PAGE_SIZE = 12;

/** Tab 类型（已安装 / 主题市场） */
type TabKey = "installed" | "market";

/** 每个 Tab 一份独立的数据状态 */
interface TabState {
    /** 已加载的数据（未加载过 = null，用于区分「没数据」与「还没拉」） */
    data: ThemeListData | null;
    loading: boolean;
    error: string | null;
}

const INITIAL_STATE: Record<TabKey, TabState> = {
    installed: { data: null, loading: false, error: null },
    market: { data: null, loading: false, error: null },
};

/** Tab → 请求函数 */
const TAB_FETCHER: Record<TabKey, () => Promise<ThemeListData>> = {
    installed: getAdminInstalledThemesApi,
    market: getAdminOfficialThemesApi,
};

/** Tab → 加载失败文案（官方接口 404 时也要说清是哪个数据源） */
const TAB_ERROR_TEXT: Record<TabKey, string> = {
    installed: "已安装主题加载失败",
    market: "主题市场加载失败",
};

/** 搜索命中的字段：名称 / 作者 / 简介 */
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

/** 加载中骨架（与真实卡片同尺寸，避免加载完成时网格跳动） */
function ThemeCardSkeletons() {
    return (
        <div className="grid grid-cols-1 gap-3 p-3 sm:min-w-[620px] sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
                    <div className="aspect-16/10 w-full animate-pulse bg-muted" />
                    <div className="flex flex-1 flex-col gap-2 p-3">
                        <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
                        <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
                        <div className="h-8 w-full animate-pulse rounded bg-muted" />
                        <div className="mt-auto h-7 w-2/3 animate-pulse rounded bg-muted" />
                    </div>
                </div>
            ))}
        </div>
    );
}

/**
 * 主题商城页：统计磁贴 + 两个 Tab（已安装 / 主题市场）+ 卡片网格 + 分页。
 * 外壳对齐相册 / 打赏管理：页面不滚，磁贴 / Tab / 分页固定在卡片上，只有网格区（admin-scroll）内部滚动。
 */
export function ThemesManager() {
    const [tab, setTab] = useState<TabKey>("installed");
    const [keyword, setKeyword] = useState("");
    /** 当前页（本地分页：仅作用于过滤后的结果） */
    const [page, setPage] = useState(1);
    /** 两个 Tab 各自独立的 list / loading / error */
    const [states, setStates] = useState<Record<TabKey, TabState>>(INITIAL_STATE);
    /** 强制重拉信号（刷新按钮 / 错误态重试） */
    const [refreshKey, setRefreshKey] = useState(0);

    /** 已成功加载过的 Tab（懒加载去重：加载过就不再请求，刷新时清掉） */
    const loadedRef = useRef<Partial<Record<TabKey, boolean>>>({});
    /** 在途请求（同一 Tab 并发只发一次；刷新时清掉以强制重发） */
    const inflightRef = useRef<Partial<Record<TabKey, Promise<void>>>>({});
    /** 请求序号：晚到的响应不能覆盖新请求的结果 */
    const reqIdRef = useRef(0);

    const loadTab = useCallback((key: TabKey, force = false) => {
        if (!force && loadedRef.current[key]) return;
        if (inflightRef.current[key]) return;

        const reqId = ++reqIdRef.current;
        // 先同步登记在途请求，挡住同一 tick 内的重复调用（React 严格模式下 effect 会跑两次）
        const task = (async () => {
            setStates((prev) => ({
                ...prev,
                [key]: { data: prev[key].data, loading: true, error: null },
            }));
            try {
                const data = await TAB_FETCHER[key]();
                if (reqId !== reqIdRef.current) return;
                loadedRef.current[key] = true;
                setStates((prev) => ({
                    ...prev,
                    [key]: { data: { list: data?.list ?? [], total: data?.total ?? 0 }, loading: false, error: null },
                }));
            } catch (e) {
                if (reqId !== reqIdRef.current) return;
                const message = e instanceof Error && e.message ? e.message : "请稍后重试";
                toast.error(`${TAB_ERROR_TEXT[key]}：${message}`);
                loadedRef.current[key] = false;
                setStates((prev) => ({ ...prev, [key]: { data: prev[key].data, loading: false, error: message } }));
            }
        })().finally(() => {
            if (inflightRef.current[key] === task) delete inflightRef.current[key];
        });
        inflightRef.current[key] = task;
    }, []);

    // 按需加载：切到某个 Tab 才拉它的接口；已加载过的不重复请求。
    // 延后一个 tick 再发起（effect 内同步 setState 会触发级联渲染，react-hooks/set-state-in-effect）。
    useEffect(() => {
        const timer = setTimeout(() => loadTab(tab), 0);
        return () => clearTimeout(timer);
    }, [tab, loadTab, refreshKey]);

    /** 刷新当前 Tab：清掉已加载标记 + 在途请求，强制重拉 */
    const reload = (key: TabKey = tab) => {
        loadedRef.current[key] = false;
        delete inflightRef.current[key];
        loadTab(key, true);
        // refreshKey 兜底触发 effect（例如首屏刚挂载、ref 里还没有该 Tab 的记录时）
        setRefreshKey((k) => k + 1);
    };

    const current = states[tab];
    const loading = current.loading;
    const error = current.error;
    const source = useMemo(() => current.data?.list ?? [], [current.data]);

    const hasFilter = keyword.trim() !== "";

    /** 本地搜索（接口没有 keyword 参数） */
    const filtered = useMemo(() => {
        const kw = keyword.trim().toLowerCase();
        if (!kw) return source;
        return source.filter((t) =>
            [t.name, t.author, t.description].some((v) => (v ?? "").toLowerCase().includes(kw))
        );
    }, [source, keyword]);

    /** 分页切片（先按关键词过滤，再切当前页） */
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    const list = useMemo(
        () => filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
        [filtered, safePage]
    );
    const total = filtered.length;

    // 过滤后页数变少时把页码收回范围内（同样延后一个 tick，避免 effect 内同步 setState）
    useEffect(() => {
        if (page <= totalPages) return;
        const timer = setTimeout(() => setPage(totalPages), 0);
        return () => clearTimeout(timer);
    }, [page, totalPages]);

    /** 磁贴：按当前 Tab 已加载的数据聚合 */
    const tiles = useMemo(() => {
        const ready = current.data !== null;
        const installedList = states.installed.data?.list ?? [];
        const currentTheme = installedList.find((t) => t.is_current);
        return [
            { label: "已安装", value: states.installed.data ? String(installedList.length) : "—", icon: Package },
            { label: "官方主题", value: ready ? String(source.filter((t) => t.isOfficial).length) : "—", icon: BadgeCheck },
            { label: "社区主题", value: ready ? String(source.filter((t) => t.themeType === "community").length) : "—", icon: Palette },
            { label: "当前主题", value: currentTheme?.name ?? "—", icon: Sparkles },
        ];
    }, [current.data, source, states.installed.data]);

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
                        disabled={loading}
                        onClick={() => reload()}
                    >
                        {loading ? (
                            <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                            <RefreshCw className="size-3.5" />
                        )}
                        刷新
                    </Button>
                </div>
            </div>

            {/* 内容：卡片内唯一滚动区（网格上方的窄条吸顶），Tab 与分页都不动 */}
            <div className="admin-scroll">
                <div className="admin-sticky-head flex items-center justify-between gap-2 border-b px-4 py-2.5 text-xs text-muted-foreground">
                    <span>
                        {tab === "installed" ? "已安装主题" : "主题市场"}
                        {loading && (
                            <span className="ml-2 text-muted-foreground/70">加载中…</span>
                        )}
                    </span>
                    {hasFilter && <span>匹配 {list.length} 个</span>}
                </div>

                {loading ? (
                    <ThemeCardSkeletons />
                ) : error ? (
                    <div className="flex flex-col items-center justify-center gap-2 py-12 text-sm">
                        <TriangleAlert className="size-6 text-destructive" />
                        <p className="text-destructive">{error}</p>
                        <p className="text-xs text-muted-foreground">
                            {tab === "installed"
                                ? "请检查后端 /theme/installed 接口是否可用"
                                : "后端 /theme/official 接口当前不可用（线上返回 404）"}
                        </p>
                        <Button variant="outline" size="sm" className="mt-1 h-7 px-2 text-xs" onClick={() => reload()}>
                            <RefreshCw className="size-3.5" />
                            重试
                        </Button>
                    </div>
                ) : list.length === 0 ? (
                    hasFilter ? (
                        // 搜索没匹配（数据已经拿到了）
                        <div className="flex flex-col items-center justify-center gap-1.5 py-12 text-sm text-muted-foreground">
                            <Search className="size-5 opacity-60" />
                            <span>没有匹配的主题</span>
                            <span className="text-xs text-muted-foreground/70">
                                共 {source.length} 个主题，换个关键词试试
                            </span>
                        </div>
                    ) : (
                        // 确实没有数据（接口成功返回空 list）
                        <div className="flex flex-col items-center justify-center gap-1.5 py-12 text-sm text-muted-foreground">
                            <Palette className="size-5 opacity-60" />
                            <span>{tab === "installed" ? "暂无已安装主题" : "主题市场暂无数据"}</span>
                            <span className="text-xs text-muted-foreground/70">
                                {tab === "installed" ? "/theme/installed" : "/theme/official"} 返回空列表
                            </span>
                        </div>
                    )
                ) : (
                    // 移动端(<640px)：grid-cols-1 卡片竖排；≥640px 起按屏宽铺开。
                    // min-w 只写在 sm: 以上，窄屏不会被撑出横向滚动。
                    <div className="grid grid-cols-1 gap-3 p-3 sm:min-w-[620px] sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                        {list.map((theme, index) => {
                            const badge = statusBadge(theme);
                            const cover = resolveAssetUrl(theme.previewUrl);
                            return (
                                <div
                                    key={theme.id ?? `${theme.name}-${index}`}
                                    className="group flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary hover:shadow-md"
                                >
                                    {/* 预览图：previewUrl 为空时用主题色渐变占位 */}
                                    <div className="relative flex aspect-16/10 w-full items-center justify-center overflow-hidden bg-gradient-to-br from-primary/15 via-muted to-muted">
                                        {cover ? (
                                            // 注释必须放在 JSX 子元素位置：用 Fragment 包一层，
                                            // 否则 {/* … */} 出现在三元分支里会直接语法错误
                                            <>
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img
                                                    src={cover}
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

                                        {/* 操作：全部占位（本轮只做读） */}
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

            {/* 分页：固定在卡片底部，不随网格滚动；⚠️ 两个主题接口都没有分页字段，分页仅作用于本地过滤结果 */}
            <div className="flex shrink-0 items-center justify-between gap-3 border-t bg-muted/40 px-4 py-2.5 text-xs text-muted-foreground">
                <span>
                    第 {safePage} / {totalPages} 页
                    <span className="ml-2 text-muted-foreground/70">（接口无分页，当前页为本地切片）</span>
                </span>
                <PaginationControls page={safePage} totalPages={totalPages} onPageChange={setPage} disabled />
            </div>
        </div>
    );
}
