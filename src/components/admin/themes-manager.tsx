"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { toast } from "sonner";
import {
    BadgeCheck,
    CheckCircle2,
    Download,
    Info,
    Loader2,
    Package,
    Palette,
    RefreshCw,
    Settings,
    Sparkles,
    Star,
    Trash2,
    TriangleAlert,
    Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatStrip } from "@/components/admin/stat-strip";
import { AdminTabBar } from "@/components/admin/admin-tabs";
import { AdminFilterBar } from "@/components/admin/filter-bar";
import { AdminEmptyState } from "@/components/admin/empty-state";
import { useConfirm } from "@/components/confirm-provider";
import { PaginationControls } from "@/components/pagination-controls";
import { StatusDot } from "@/components/admin/status-dot";
import { ThemeConfigDialog } from "@/components/admin/theme-config-dialog";
import { ThemeUploadDialog } from "@/components/admin/theme-upload-dialog";
import { cn, resolveAssetUrl } from "@/lib/utils";
import { ACTION_TONE } from "@/lib/action-tones";
import { getAdminInstalledThemesApi, getAdminOfficialThemesApi } from "@/lib/api";
import {
    extractThemeNameFromUrl,
    getCurrentThemeConfigApi,
    installThemeApi,
    switchThemeApi,
    uninstallThemeApi,
} from "@/lib/api-themes-write";
import { DEPLOY_TYPE_LABEL, SSR_STATUS_LABEL, THEME_TYPE_LABEL } from "@/types/themes";
import type { Theme, ThemeConfigResponse, ThemeListData, ThemeSettingGroup } from "@/types/themes";

/**
 * 主题商城页：统计磁贴 + 两个 Tab（已安装 / 主题市场）+ 卡片网格 + 分页。
 *
 * 数据源：
 *  - GET /api/admin/themes/installed → 远端 /theme/installed（已安装主题）
 *  - GET /api/admin/themes/official  → 远端 /public/theme/market（主题市场 / 官方主题）
 *    ⚠️ 历史误判已修正：原先转发到 /theme/official 且用 GET，而后端 /api/theme/official 是 POST（切换主题的动作），
 *    所以线上一直 404。真实列表接口是公开的 GET /api/public/theme/market（实测 200，字段与本页所需一致）。
 *    两个接口都无分页参数，响应形状均为 { list, total }（见 @/types/themes）。
 *
 * 加载策略：Tab 各自独立请求，切到哪个 Tab 才拉哪个（懒加载），已加载过的不重复请求；
 * 「刷新」按钮强制重拉当前 Tab（并清掉它的请求去重缓存）。
 * 搜索仍是本地过滤（接口没有 keyword 参数）；分页按本地过滤结果切片（每页 12）。
 *
 * 写操作（本轮接入；代理契约见 src/app/api/admin/themes 下的各 route.ts，
 * 客户端助手见 src/lib/api-themes-write.ts）：
 *  - 应用主题  POST /theme/switch        { theme_name }                    ← 二次确认，成功后提示刷新
 *  - 卸载      POST /theme/uninstall     { theme_name }                    ← 二次确认；当前启用 / 官方主题禁用
 *  - 安装      POST /theme/install       { theme_name, download_url, theme_market_id? }
 *  - 上传      POST /theme/upload        multipart(file, force_update?)     ← 先 validate 再 upload
 *  - 设置      GET  /theme/settings + GET /theme/config → POST /theme/config
 *  - 详情      GET  /theme/current-config（当前主题名 + 字段定义 + 生效值）
 *  ⚠️ 这些远端接口在 JWTAuth（非 AdminAuth）下，同源代理负责 cookie → Bearer。
 */

const PAGE_SIZE = 12;

/** Tab 类型（已安装 / 主题市场） */
type TabKey = "installed" | "market";

/** 单卡片上正在进行的写操作（同一主题同时只允许一个，按钮显示 loading） */
type PendingAction = "switch" | "uninstall" | "install";

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

/** 主题类型 → 中文标签 */
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

/** 官方内置主题名（后端 isOfficialTheme 的判定表，service.go:934-947）：这些主题不能卸载 */
const OFFICIAL_THEME_NAMES = ["theme-anheyu", "安和鱼官方主题", "安知鱼官方主题", "官方主题"];

/** 是否是官方内置主题（卸载会被后端拒绝，前端先禁用） */
function isOfficialTheme(theme: Theme): boolean {
    return theme.isOfficial === true || OFFICIAL_THEME_NAMES.includes(theme.name ?? "");
}

/** 主题配置值的只读展示文本（详情弹窗用） */
function readOnlyValue(value: unknown): string {
    if (value === null || value === undefined || value === "") return "—";
    if (typeof value === "boolean") return value ? "开启" : "关闭";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
}

/** 加载中骨架（与真实卡片同尺寸，避免加载完成时网格跳动） */
function ThemeCardSkeletons() {
    return (
        <div className="grid grid-cols-1 gap-3 p-3 sm:min-w-[620px] sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex flex-col overflow-hidden soft-surface">
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
 * 主题详情弹窗：GET /api/theme/current-config 一次拿到「当前主题名 + 配置字段定义 + 生效值」。
 * 这里只读展示（要改值请用卡片上的「设置」，它按同一份定义生成可编辑表单）。
 */
function ThemeDetailDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (next: boolean) => void }) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<ThemeConfigResponse | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await getCurrentThemeConfigApi();
            setData(result);
        } catch (e) {
            setData(null);
            setError(e instanceof Error ? e.message : "获取当前主题配置失败");
        } finally {
            setLoading(false);
        }
    }, []);

    // 打开时拉取一次（关闭后不保留旧数据，下次打开重新拉）
    useEffect(() => {
        if (!open) return;
        const timer = setTimeout(() => void load(), 0);
        return () => clearTimeout(timer);
    }, [open, load]);

    const groups: ThemeSettingGroup[] = data?.settings ?? [];
    const values = data?.values ?? {};

    return (
        <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
            <DialogPrimitive.Portal>
                <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
                <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[86vh] w-[min(94vw,42rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden soft-surface shadow-2xl data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
                    <div className="flex shrink-0 items-start gap-2 border-b px-5 py-3.5">
                        <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                            <DialogPrimitive.Title className="truncate text-base font-semibold">
                                主题详情
                            </DialogPrimitive.Title>
                            <DialogPrimitive.Description className="mt-0.5 text-xs text-muted-foreground">
                                当前启用主题的配置定义与生效值（来源 /api/theme/current-config）
                            </DialogPrimitive.Description>
                        </div>
                        <Button
                            variant="ghost"
                            size="icon-sm"
                            className="shrink-0"
                            disabled={loading}
                            onClick={() => void load()}
                            aria-label="重新获取"
                        >
                            {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                        </Button>
                    </div>

                    <div className="admin-scroll min-h-0 flex-1">
                        {loading ? (
                            <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
                                正在获取当前主题配置…
                            </div>
                        ) : error ? (
                            <div className="flex flex-col items-center justify-center gap-1.5 py-16 text-sm">
                                <p className="text-destructive">{error}</p>
                                <p className="text-xs text-muted-foreground">请确认后端 /theme/current-config 可用</p>
                            </div>
                        ) : (
                            <div className="space-y-4 p-5">
                                <div className="rounded-lg border bg-muted/40 px-3 py-2">
                                    <p className="text-xs text-muted-foreground">当前主题</p>
                                    <p className="text-sm font-medium">{data?.theme_name || "—"}</p>
                                </div>

                                {groups.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center gap-1.5 py-8 text-sm text-muted-foreground">
                                        <Info className="size-5 opacity-60" />
                                        <span>当前主题没有可展示的配置项</span>
                                        <span className="text-xs text-muted-foreground/70">
                                            官方内置主题不提供自定义配置
                                        </span>
                                    </div>
                                ) : (
                                    groups.map((group) => (
                                        <div key={group.group} className="space-y-2">
                                            <p className="text-xs font-medium text-muted-foreground">
                                                {group.label || group.group}
                                            </p>
                                            <div className="overflow-hidden rounded-lg border">
                                                {(group.fields ?? []).map((field, index) => (
                                                    <div
                                                        key={field.name}
                                                        className={cn(
                                                            "flex items-start justify-between gap-3 px-3 py-2 text-xs",
                                                            index > 0 && "border-t"
                                                        )}
                                                    >
                                                        <span className="shrink-0 text-muted-foreground">
                                                            {field.label || field.name}
                                                        </span>
                                                        <span className="min-w-0 break-all text-right font-mono">
                                                            {readOnlyValue(values[field.name])}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </div>

                    <div className="flex shrink-0 justify-end border-t bg-muted/40 px-5 py-3">
                        <DialogPrimitive.Close asChild>
                            <Button variant="outline" size="sm" className="h-8 text-xs">
                                关闭
                            </Button>
                        </DialogPrimitive.Close>
                    </div>
                </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
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

    /** 当前正在操作的主题名（写操作串行化，避免并发重复点击） */
    const [pending, setPending] = useState<{ name: string; action: PendingAction } | null>(null);
    /** 主题设置弹窗的目标主题（null = 关闭） */
    const [configTheme, setConfigTheme] = useState<string | null>(null);
    /** 上传主题弹窗开关 */
    const [uploadOpen, setUploadOpen] = useState(false);
    /** 主题详情弹窗开关 */
    const [detailOpen, setDetailOpen] = useState(false);

    /** 已成功加载过的 Tab（懒加载去重：加载过就不再请求，刷新时清掉） */
    const loadedRef = useRef<Partial<Record<TabKey, boolean>>>({});
    /** 在途请求（同一 Tab 并发只发一次；刷新时清掉以强制重发） */
    const inflightRef = useRef<Partial<Record<TabKey, Promise<void>>>>({});
    /** 请求序号：晚到的响应不能覆盖新请求的结果 */
    const reqIdRef = useRef(0);

    // 应用内确认弹窗（替代 window.confirm，见 components/confirm-provider.tsx）
    const confirm = useConfirm();

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

    /**
     * 写操作成功后重新同步数据：
     *  - 已安装 Tab 一定重拉（写操作都会改变已安装列表 / 当前状态）
     *  - 目标 Tab 就是已安装时只发一次（避免一次点击打两个请求）
     */
    const resyncAfterWrite = (targetTab: TabKey = "installed") => {
        loadedRef.current[targetTab] = false;
        delete inflightRef.current[targetTab];
        loadTab(targetTab, true);
        if (targetTab !== "installed") {
            loadedRef.current.installed = false;
            delete inflightRef.current.installed;
            loadTab("installed", true);
        }
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

    /** 应用（切换）主题：会立刻改变全站外观，故二次确认 */
    const handleSwitch = async (theme: Theme) => {
        const name = theme.name ?? "";
        if (!name) {
            toast.error("该主题缺少名称，无法切换");
            return;
        }
        if (theme.is_current) return;
        if (
            !(await confirm({
                title: `确定应用主题「${name}」吗？`,
                description: "会立刻改变全站外观（前台需要刷新页面才能看到）。",
            }))
        )
            return;

        setPending({ name, action: "switch" });
        try {
            await switchThemeApi(name);
            toast.success(`已切换到「${name}」，请刷新页面查看新外观`, {
                // 切换会改全站 CSS / 静态资源，给一个立刻刷新页面的入口
                action: { label: "刷新页面", onClick: () => window.location.reload() },
                duration: 6000,
            });
            resyncAfterWrite();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "切换主题失败");
        } finally {
            setPending(null);
        }
    };

    /** 卸载主题：不可恢复，故二次确认；当前启用 / 官方主题按钮已禁用 */
    const handleUninstall = async (theme: Theme) => {
        const name = theme.name ?? "";
        if (!name) {
            toast.error("该主题缺少名称，无法卸载");
            return;
        }
        if (
            !(await confirm({
                title: `确定卸载主题「${name}」吗？`,
                description: "会删除主题文件与安装记录，不可恢复。",
                danger: true,
            }))
        )
            return;

        setPending({ name, action: "uninstall" });
        try {
            await uninstallThemeApi(name);
            toast.success(`已卸载「${name}」`);
            resyncAfterWrite();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "卸载主题失败");
        } finally {
            setPending(null);
        }
    };

    /** 安装主题：从商城条目的 downloadUrl 下载并安装（无 downloadUrl 时禁用按钮） */
    const handleInstall = async (theme: Theme) => {
        const downloadUrl = theme.downloadUrl ?? "";
        if (!downloadUrl) {
            toast.error("该主题没有提供下载地址，无法安装");
            return;
        }
        // 后端要求 theme_name 以 theme- 开头（handler.go:223-227），故优先从 URL 反推
        const name = extractThemeNameFromUrl(downloadUrl) || theme.name || "";
        if (!name) {
            toast.error("无法确定主题名称，安装已取消");
            return;
        }
        if (
            !(await confirm({
                title: `确定安装主题「${theme.name || name}」吗？`,
                description: "会从远端下载并解压主题包。",
            }))
        )
            return;

        setPending({ name: theme.name ?? name, action: "install" });
        try {
            await installThemeApi({
                theme_name: name,
                download_url: downloadUrl,
                theme_market_id: theme.id || undefined,
            });
            toast.success(`「${theme.name || name}」安装成功，可点击「应用主题」启用`);
            resyncAfterWrite();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "安装主题失败");
        } finally {
            setPending(null);
        }
    };

    /** 上传安装成功：切到「已安装」并刷新（主题已落盘，列表需要重拉） */
    const handleUploaded = () => {
        setTab("installed");
        setPage(1);
        loadedRef.current.installed = false;
        delete inflightRef.current.installed;
        loadTab("installed", true);
        setRefreshKey((k) => k + 1);
    };

    return (
        <div className="admin-card">
            {/* 统计磁贴：固定在卡片顶部（shrink-0），不随内容滚动 */}
            <StatStrip items={tiles} />

            {/* 页签单独一行，筛选另起一行：都固定在卡片顶部（shrink-0），不随网格滚动 */}
            <AdminTabBar
                tabs={[
                    { key: "installed", label: "已安装" },
                    { key: "market", label: "主题市场" },
                ]}
                value={tab}
                onChange={(key) => {
                    setTab(key);
                    setPage(1);
                }}
            />
            <AdminFilterBar
                search={{
                    value: keyword,
                    onChange: (v) => {
                        setKeyword(v);
                        setPage(1);
                    },
                    placeholder: "搜索主题名称 / 作者…",
                    ariaLabel: "搜索主题",
                }}
                onReset={() => {
                    setKeyword("");
                    setPage(1);
                }}
                resetDisabled={!keyword}
                summary={
                    <>
                        共 <span className="font-medium text-foreground">{total}</span> 个
                        {tab === "installed" ? "已安装主题" : "市场主题"}
                    </>
                }
                actions={
                    <>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8 shrink-0 text-sm"
                            onClick={() => setUploadOpen(true)}
                        >
                            <Upload className="size-3.5" />
                            上传主题
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8 shrink-0 text-sm"
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
                    </>
                }
            />

            {/* 内容：卡片内唯一滚动区（网格上方的窄条吸顶），Tab 与分页都不动 */}
            <div className="admin-scroll">
                {/* 页签已经说明了这一屏是什么，这里只在搜索/加载时出现，避免标题重复 */}
                {(hasFilter || loading) && (
                    <div className="admin-sticky-head flex items-center justify-between gap-2 border-b px-4 py-2 text-xs text-muted-foreground">
                        <span>{loading ? "加载中…" : "筛选结果"}</span>
                        {hasFilter && <span>匹配 {list.length} 个</span>}
                    </div>
                )}

                {loading ? (
                    <ThemeCardSkeletons />
                ) : error ? (
                    <div className="flex flex-col items-center justify-center gap-2 py-12 text-sm">
                        <TriangleAlert className="size-6 text-destructive" />
                        <p className="text-destructive">{error}</p>
                        <p className="text-xs text-muted-foreground">
                            {tab === "installed"
                                ? "请检查后端 /theme/installed 接口是否可用"
                                : "请检查后端 /public/theme/market 接口是否可用"}
                        </p>
                        <Button variant="outline" size="sm" className="mt-1 h-7 px-2 text-xs" onClick={() => reload()}>
                            <RefreshCw className="size-3.5" />
                            重试
                        </Button>
                    </div>
                ) : list.length === 0 ? (
                    <AdminEmptyState
                        kind={hasFilter ? "search" : "generic"}
                        title={hasFilter ? undefined : tab === "installed" ? "还没有装主题" : "主题市场是空的"}
                        description={
                            hasFilter
                                ? `共 ${source.length} 个主题，换个关键词试试`
                                : tab === "installed"
                                  ? "点右上角「上传主题」装一个本地 ZIP，或去主题市场挑一个"
                                  : "/public/theme/market 返回空列表，检查远端是否已录入主题"
                        }
                    />
                ) : (
                    // 移动端(<640px)：grid-cols-1 卡片竖排；≥640px 起按屏宽铺开。
                    // 窄屏也保持 min-w：整张表横向滚动，列不会被压扁。
                    <div className="grid grid-cols-1 gap-3 p-3 sm:min-w-[620px] sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                        {list.map((theme, index) => {
                            const badge = statusBadge(theme);
                            const cover = resolveAssetUrl(theme.previewUrl);
                            const name = theme.name ?? "";
                            const busyAction = pending?.name === name ? pending.action : null;
                            /** 官方内置主题 / 无下载地址的市场主题不能安装 */
                            const noDownload = !theme.downloadUrl;
                            return (
                                <div
                                    key={theme.id ?? `${theme.name}-${index}`}
                                    className="group flex flex-col overflow-hidden soft-surface transition-all hover:-translate-y-0.5 hover:border-primary hover:shadow-md"
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
                                            <StatusDot cls={badge.cls} className="shrink-0">
                                                {badge.label}
                                            </StatusDot>
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

                                        {/* 操作：真实动作（写操作契约见文件头注释） */}
                                        <div className="mt-auto flex flex-wrap items-center gap-2 border-t pt-2">
                                            {theme.is_installed ? (
                                                <>
                                                    {/* 应用：切换主题（幂等；当前已启用时禁用） */}
                                                    <Button
                                                        size="sm"
                                                        className="h-7 px-2 text-xs"
                                                        disabled={theme.is_current || busyAction !== null}
                                                        title={theme.is_current ? "该主题正在使用中" : "切换到这个主题"}
                                                        onClick={() => void handleSwitch(theme)}
                                                    >
                                                        {busyAction === "switch" ? (
                                                            <Loader2 className="size-3.5 animate-spin" />
                                                        ) : (
                                                            <Sparkles className="size-3.5" />
                                                        )}
                                                        {theme.is_current ? "使用中" : "应用主题"}
                                                    </Button>
                                                    {/* 设置：按 theme.json 的 settings 动态渲染表单 */}
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className={cn("h-7 px-2 text-xs", ACTION_TONE.edit)}
                                                        disabled={busyAction !== null}
                                                        onClick={() => setConfigTheme(name)}
                                                    >
                                                        <Settings className="size-3.5" />
                                                        设置
                                                    </Button>
                                                    {/* 卸载：当前启用主题 / 官方内置主题都不可卸载（后端同样拒绝） */}
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        disabled={
                                                            theme.is_current || isOfficialTheme(theme) || busyAction !== null
                                                        }
                                                        title={
                                                            theme.is_current
                                                                ? "当前正在使用，不能卸载；请先切换到其他主题"
                                                                : isOfficialTheme(theme)
                                                                  ? "官方内置主题不可卸载"
                                                                  : "卸载该主题"
                                                        }
                                                        className={cn("h-7 px-2 text-xs", ACTION_TONE.delete)}
                                                        onClick={() => void handleUninstall(theme)}
                                                    >
                                                        {busyAction === "uninstall" ? (
                                                            <Loader2 className="size-3.5 animate-spin" />
                                                        ) : (
                                                            <Trash2 className="size-3.5" />
                                                        )}
                                                        卸载
                                                    </Button>
                                                </>
                                            ) : (
                                                <>
                                                    {/* 安装：从 download_url 下载解压；无下载地址（如官方内置）禁用 */}
                                                    <Button
                                                        size="sm"
                                                        className="h-7 px-2 text-xs"
                                                        disabled={noDownload || busyAction !== null}
                                                        title={
                                                            noDownload
                                                                ? "该主题未提供下载地址（官方内置主题已随程序发布）"
                                                                : "下载并安装该主题"
                                                        }
                                                        onClick={() => void handleInstall(theme)}
                                                    >
                                                        {busyAction === "install" ? (
                                                            <Loader2 className="size-3.5 animate-spin" />
                                                        ) : (
                                                            <Download className="size-3.5" />
                                                        )}
                                                        安装
                                                    </Button>
                                                    {/* 详情：当前启用主题的配置定义与生效值 */}
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="h-7 px-2 text-xs"
                                                        onClick={() => setDetailOpen(true)}
                                                    >
                                                        <Info className="size-3.5" />
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
                <PaginationControls page={safePage} totalPages={totalPages} onPageChange={setPage} />
            </div>

            {/* 主题设置弹窗（动态表单）：保存走 POST /theme/config */}
            <ThemeConfigDialog
                themeName={configTheme}
                onClose={() => setConfigTheme(null)}
                onSaved={() => resyncAfterWrite()}
            />
            {/* 上传主题压缩包：校验 + 上传安装 */}
            <ThemeUploadDialog open={uploadOpen} onOpenChange={setUploadOpen} onUploaded={handleUploaded} />
            {/* 主题详情：当前启用主题的配置定义与生效值 */}
            <ThemeDetailDialog open={detailOpen} onOpenChange={setDetailOpen} />
        </div>
    );
}
