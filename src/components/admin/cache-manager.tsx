"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
    AlertTriangle,
    Database,
    FileText,
    HardDrive,
    Image as ImageIcon,
    Layers,
    RefreshCw,
    ScanSearch,
    Server,
    Trash2,
    Zap,
    type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { getCacheStatusApi, manageCacheApi, revalidateCacheApi } from "@/lib/api-cache";
import type { CachePurgeType, CacheStatus, CacheStatusDetail } from "@/lib/api-cache";
import { ACTION_TONE } from "@/lib/action-tones";

/* =============================================================================
 * 后台「缓存管理」页 —— 接真后端接口
 *
 * 接口（源码证据：scripts/anheyu/anheyu-app-main/cmd/server/cache_management.go:23-28）
 *   GET  /api/admin/cache/status       → 各块缓存的可用性与统计
 *   POST /api/admin/cache/revalidate   → 让后端去调 Next.js /revalidate（SSR 模式清前端缓存）
 *   POST /api/admin/cache/manage       → body { type: page|image|index }，清对应后端缓存
 * 三道请求都走本站同源代理 /api/admin/cache/<接口名>（见 src/app/api/admin/cache 下的同名路由）。
 *
 * ⚠️ 状态字段是「按远端 Go 源码推导」的：线上 /status 未登录只能拿到 401，
 *    拿不到鉴权后的真实响应，所以 CacheStatus 里所有块都声明为可选，
 *    组件对缺字段一律降级展示（—），后端将来改字段名也不会把页面打崩。
 *    依据：cmd/server/cache_management.go:49-55 的 Configure 回调返回
 *    { page:{available,entries}, index:{available,healthy}, image:{available,stats?}, ssr:{available} }。
 *
 * ⚠️ 写操作（revalidate / manage）**不在开发期实测** —— 会真去清线上缓存。
 *    所以每个写操作都强制走二次确认对话框，成功/失败用 toast 反馈。
 * ========================================================================== */

/** 页面内存缓存条目数（entries 可能是数字、浮点串或缺失，统一收敛成数字 | undefined） */
function toCount(value: unknown): number | undefined {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "") {
        const n = Number(value);
        if (Number.isFinite(n)) return n;
    }
    return undefined;
}

/** 数字展示：缺数据时给占位符，避免出现 "undefined" 或 "NaN" */
function num(value: unknown): string {
    const n = toCount(value);
    return n === undefined ? "—" : n.toLocaleString("zh-CN");
}

/** 字节数 → B / KB / MB / GB（图片缓存占用空间用） */
function formatBytes(value: unknown): string {
    const n = toCount(value);
    if (n === undefined || n <= 0) return "—";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let v = n;
    let i = 0;
    while (v >= 1024 && i < units.length - 1) {
        v /= 1024;
        i += 1;
    }
    return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/** 时间戳 → YYYY-MM-DD HH:MM:SS（本地时区；只在用户点击后渲染，不涉及水合一致性） */
function formatClock(date: Date): string {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(
        date.getMinutes()
    )}:${p(date.getSeconds())}`;
}

/** 状态徽章配色（同一个色板在深浅色主题下都可读） */
const TONE = {
    green: "bg-green-500/15 text-green-600 dark:text-green-400",
    amber: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    red: "bg-red-500/15 text-red-600 dark:text-red-400",
    gray: "bg-muted text-muted-foreground",
    blue: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    violet: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
    emerald: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
} as const;

/** 可清理的缓存类型（与远端 Configure 注册的 actions 键一致） */
const PURGE_ACTIONS: {
    type: CachePurgeType;
    title: string;
    desc: string;
    icon: LucideIcon;
    tile: string;
}[] = [
    {
        type: "page",
        title: "页面缓存",
        desc: "清空后端进程内的页面内存缓存（frontend.ClearPageCache）",
        icon: FileText,
        tile: TONE.blue,
    },
    {
        type: "image",
        title: "图片缓存",
        desc: "清空磁盘上的图片派生缓存（image_style.DiskCache.Purge）",
        icon: ImageIcon,
        tile: TONE.violet,
    },
    {
        type: "index",
        title: "索引缓存",
        desc: "按已发布文章重建搜索索引（先清空再逐篇重建，耗时较长）",
        icon: ScanSearch,
        tile: TONE.emerald,
    },
];

/** 一次写操作的上下文（用于二次确认对话框的文案与按钮态） */
interface PendingAction {
    /** 确认后要执行的调用 */
    run: () => Promise<void>;
    title: string;
    description: string;
    /** 确认按钮文案，如「重新验证」 */
    confirmLabel: string;
    /** 「进行中」文案 */
    busyLabel: string;
    /** 是否用危险样式（清理类操作用红色） */
    danger: boolean;
    /** 成功后的 toast 文案 */
    successToast: string;
}

/** 每块缓存的状态徽章文案：可用 / 不可用 / 不可读 */
function availabilityBadge(section: CacheStatusDetail | undefined): { label: string; cls: string } {
    if (!section) return { label: "未知", cls: TONE.gray };
    if (typeof section.error === "string") return { label: "读取失败", cls: TONE.red };
    if (section.available === true) return { label: "可用", cls: TONE.green };
    if (section.available === false) return { label: "不可用", cls: TONE.amber };
    return { label: "未知", cls: TONE.gray };
}

/** 状态卡片里的一行「标签 + 值」 */
function DetailRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="shrink-0 text-muted-foreground">{label}</span>
            <span className="min-w-0 truncate text-right font-medium tabular-nums text-foreground" title={value}>
                {value}
            </span>
        </div>
    );
}

/** 状态卡片：图标 + 标题 + 可用性徽章 + 若干明细行 */
function StatusCard({
    icon: Icon,
    title,
    hint,
    badge,
    rows,
}: {
    icon: LucideIcon;
    title: string;
    hint?: string;
    badge: { label: string; cls: string };
    rows: { label: string; value: string }[];
}) {
    return (
        <div className="flex flex-col gap-2.5 rounded-xl border bg-card p-3.5">
            <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        <Icon className="size-4" />
                    </span>
                    <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{title}</p>
                        {hint && <p className="truncate text-xs text-muted-foreground/70">{hint}</p>}
                    </div>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}>
                    {badge.label}
                </span>
            </div>
            {rows.length > 0 && (
                <div className="space-y-1.5 border-t pt-2.5">
                    {rows.map((r) => (
                        <DetailRow key={r.label} label={r.label} value={r.value} />
                    ))}
                </div>
            )}
        </div>
    );
}

/**
 * 缓存管理页：状态卡片区（只读）+ 操作区（写操作全部二次确认）。
 *
 * 布局沿用后台列表页外壳：.admin-card 内只有 .admin-scroll 一个直系滚动子元素，
 * 加载 / 空 / 错误三态都渲染在这个滚动区里，卡片外壳保持不变。
 */
export function CacheManager() {
    const [status, setStatus] = useState<CacheStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    /** 上次拉取成功的时刻（只在用户交互后更新，不放 SSR） */
    const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
    /** 重新拉取的触发计数 */
    const [refreshKey, setRefreshKey] = useState(0);
    /** 正在进行的写操作（null 表示空闲），用于禁用按钮 + 显示「进行中…」 */
    const [busy, setBusy] = useState<string | null>(null);
    /** 待确认的写操作（非 null 时弹出确认对话框） */
    const [pending, setPending] = useState<PendingAction | null>(null);

    // 拉取状态（浏览器自动携带登录 cookie）。延后到下一个 tick 再 setLoading，
    // 避免在 effect 内同步 setState 触发级联渲染（react-hooks/set-state-in-effect）。
    useEffect(() => {
        let cancelled = false;
        const timer = setTimeout(() => setLoading(true), 0);
        getCacheStatusApi()
            .then((data) => {
                if (cancelled) return;
                setStatus(data);
                setFetchedAt(new Date());
                setError(null);
            })
            .catch((e: unknown) => {
                if (cancelled) return;
                const msg = e instanceof Error ? e.message : "缓存状态加载失败";
                // 出错时清空旧数据：错误态独占滚动区，不展示可能已经过期的统计
                setStatus(null);
                setError(msg);
                toast.error(msg);
            })
            .finally(() => {
                if (cancelled) return;
                clearTimeout(timer);
                setLoading(false);
            });
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [refreshKey]);

    const retry = useCallback(() => setRefreshKey((k) => k + 1), []);

    /** 执行确认后的写操作：统一 loading / toast / 成功后刷新状态 */
    const runAction = useCallback(
        async (action: PendingAction) => {
            setBusy(action.confirmLabel);
            try {
                await action.run();
                toast.success(action.successToast);
                // 缓存刚被改动 → 重新拉一次状态，让统计与徽章跟着更新
                setRefreshKey((k) => k + 1);
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : `${action.confirmLabel}失败`);
            } finally {
                setBusy(null);
                setPending(null);
            }
        },
        []
    );

    /** 打开二次确认对话框（写操作绝不直接发请求） */
    const askRevalidateAll = () => {
        setPending({
            title: "重新验证前端缓存",
            description:
                "将对远端发起 POST /api/admin/cache/revalidate（type=all），由后端调用 Next.js 的 /revalidate 接口清空前台 ISR 缓存。\n" +
                "执行期间前台可能出现短暂的重新生成（首个访问会变慢），但不会丢数据。",
            confirmLabel: "重新验证",
            busyLabel: "重新验证中…",
            danger: false,
            successToast: "已触发重新验证",
            run: () => revalidateCacheApi({ type: "all" }),
        });
    };

    const askPurge = (action: (typeof PURGE_ACTIONS)[number]) => {
        setPending({
            title: `清理${action.title}`,
            description:
                `将对远端发起 POST /api/admin/cache/manage（type=${action.type}），${action.desc}。\n` +
                "清理后这部分缓存会立即失效，后续请求会重新生成（首个请求会变慢）。",
            confirmLabel: `清理${action.title}`,
            busyLabel: "清理中…",
            danger: true,
            successToast: `${action.title}已清理`,
            run: () => manageCacheApi(action.type),
        });
    };

    // ===== 状态卡片的数据组装（所有字段都可能是 undefined → 统一降级成 "—"） =====
    const page = status?.page;
    const index = status?.index;
    const image = status?.image;
    const ssr = status?.ssr;
    const imageStats = image?.stats;
    const statsReady = !loading && !error;

    /** 图片缓存命中率：优先用 per-policy 计数，缺失时回退到进程级全局计数（后者是所有策略共享的） */
    const hit = toCount(imageStats?.policy_hit_count) ?? toCount(imageStats?.hit_count);
    const miss = toCount(imageStats?.policy_miss_count) ?? toCount(imageStats?.miss_count);
    const hitRate =
        hit === undefined || miss === undefined || hit + miss === 0
            ? "—"
            : `${((hit / (hit + miss)) * 100).toFixed(1)}%`;

    const cards = [
        {
            key: "page",
            icon: Database,
            title: "页面缓存",
            hint: "后端进程内页面内存缓存",
            badge: statsReady ? availabilityBadge(page) : { label: "加载中", cls: TONE.gray },
            rows: [{ label: "缓存条目", value: statsReady ? num(page?.entries) : "—" }],
        },
        {
            key: "image",
            icon: HardDrive,
            title: "图片缓存",
            hint: "磁盘上的图片派生缓存",
            badge: statsReady ? availabilityBadge(image) : { label: "加载中", cls: TONE.gray },
            rows: [
                { label: "缓存条目", value: statsReady ? num(imageStats?.count) : "—" },
                { label: "占用空间", value: statsReady ? formatBytes(imageStats?.total_size) : "—" },
                { label: "命中率", value: statsReady ? hitRate : "—" },
                {
                    label: "统计说明",
                    value: statsReady ? (image?.error ?? (imageStats ? "正常" : "无统计")) : "—",
                },
            ],
        },
        {
            key: "index",
            icon: ScanSearch,
            title: "索引缓存",
            hint: "全文搜索索引",
            badge: statsReady ? availabilityBadge(index) : { label: "加载中", cls: TONE.gray },
            rows: [
                {
                    label: "健康检查",
                    value: statsReady
                        ? index?.available
                            ? index?.healthy
                                ? "通过"
                                : "未通过"
                            : "未启用"
                        : "—",
                },
            ],
        },
        {
            key: "ssr",
            icon: Zap,
            title: "SSR 重新验证",
            hint: "Next.js ISR 缓存清理能力",
            badge: statsReady ? availabilityBadge(ssr) : { label: "加载中", cls: TONE.gray },
            rows: [
                {
                    label: "清理能力",
                    value: statsReady ? ((ssr?.available ?? status?.enabled) ? "已启用" : "未启用") : "—",
                },
            ],
        },
    ];

    return (
        <div className="admin-card">
            {/* ===== 标题条 + 刷新：固定在卡片顶部（shrink-0），不随内容滚动 ===== */}
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b bg-muted/40 px-4 py-2.5">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Layers className="size-3.5" />
                    <span>缓存状态</span>
                    {fetchedAt && <span className="text-muted-foreground/70">更新于 {formatClock(fetchedAt)}</span>}
                    {status?.runtime_settings && status.runtime_settings.length > 0 && (
                        <span className="text-muted-foreground/70">
                            运行时设置：{status.runtime_settings.join("、")}
                        </span>
                    )}
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    disabled={loading || !!busy}
                    onClick={retry}
                >
                    <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
                    刷新
                </Button>
            </div>

            {/* ===== 内容区：卡片内唯一滚动区，加载 / 错误 / 状态+操作三态都在这里 ===== */}
            <div className="admin-scroll">
                {loading ? (
                    <div className="grid gap-2.5 p-4 md:grid-cols-2 xl:grid-cols-4" aria-busy="true" aria-label="加载中">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="flex flex-col gap-3 rounded-xl border p-3.5">
                                <div className="flex items-center gap-2">
                                    <div className="size-8 animate-pulse rounded-lg bg-muted" />
                                    <div className="h-3 w-20 animate-pulse rounded bg-muted" />
                                </div>
                                <div className="h-3 w-full animate-pulse rounded bg-muted" />
                                <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
                            </div>
                        ))}
                    </div>
                ) : error ? (
                    // 错误态（远端 401 / 404、后端不可达都走这里）：消息 + 重试，页面不白屏
                    <div className="flex min-h-64 flex-col items-center justify-center gap-2 px-4 py-12 text-center">
                        <span className="flex size-12 items-center justify-center rounded-full border bg-destructive/10">
                            <AlertTriangle className="size-5 text-destructive" />
                        </span>
                        <p className="text-sm font-medium text-destructive">缓存状态加载失败</p>
                        <p className="max-w-md text-xs text-muted-foreground">{error}</p>
                        <p className="max-w-md text-xs text-muted-foreground/70">
                            接口为 GET /api/admin/cache/status（经本站同源代理转发，需管理员登录）
                        </p>
                        <Button variant="outline" size="sm" className="mt-1 h-8 rounded-lg text-xs" onClick={retry}>
                            <RefreshCw className="size-3.5" />
                            重试
                        </Button>
                    </div>
                ) : (
                    <div className="flex flex-col gap-4 p-4">
                        {/* ---- 状态卡片区 ---- */}
                        <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-4">
                            {cards.map((c) => (
                                <StatusCard
                                    key={c.key}
                                    icon={c.icon}
                                    title={c.title}
                                    hint={c.hint}
                                    badge={c.badge}
                                    rows={c.rows}
                                />
                            ))}
                        </div>

                        {/* ---- 操作区 ---- */}
                        <section className="rounded-xl border">
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-4 py-2.5">
                                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                                    <Server className="size-4 text-muted-foreground" />
                                    操作
                                </div>
                                <span className="text-xs text-muted-foreground">
                                    所有操作都会二次确认 · 执行期间请勿重复提交
                                </span>
                            </div>

                            <div className="divide-y">
                                {/* 重新验证：整个前端缓存（ISR） */}
                                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                                    <div className="min-w-0">
                                        <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                                            <RefreshCw className="size-4 text-primary" />
                                            重新验证前端缓存
                                        </p>
                                        <p className="mt-0.5 text-xs text-muted-foreground">
                                            让后端调用 Next.js /revalidate，清空前台 ISR 缓存（type=all）
                                            {ssr && ssr.available === false && " · 当前后端未启用（需配置 REVALIDATE_TOKEN）"}
                                        </p>
                                    </div>
                                    <Button
                                        size="sm"
                                        className="h-7 shrink-0 px-2 text-xs"
                                        disabled={!!busy}
                                        onClick={askRevalidateAll}
                                    >
                                        <Zap className="size-3.5" />
                                        {busy === "重新验证" ? "重新验证中…" : "重新验证"}
                                    </Button>
                                </div>

                                {/* 按 type 清理：页面 / 图片 / 索引 */}
                                {PURGE_ACTIONS.map((action) => {
                                    const section =
                                        action.type === "page" ? page : action.type === "image" ? image : index;
                                    const disabled = !!busy || (statsReady && section?.available === false);
                                    return (
                                        <div
                                            key={action.type}
                                            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                                        >
                                            <div className="flex min-w-0 items-start gap-2.5">
                                                <span
                                                    className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg ${action.tile}`}
                                                >
                                                    <action.icon className="size-4" />
                                                </span>
                                                <div className="min-w-0">
                                                    <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-foreground">
                                                        {action.title}
                                                        {statsReady && section?.available === false && (
                                                            <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                                                                当前不可用
                                                            </span>
                                                        )}
                                                    </p>
                                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                                        {action.desc}
                                                        <span className="ml-1 text-muted-foreground/70">
                                                            （type={action.type}）
                                                        </span>
                                                    </p>
                                                </div>
                                            </div>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className={`h-7 shrink-0 px-2 text-xs ${ACTION_TONE.delete}`}
                                                disabled={disabled}
                                                title={disabled && !busy ? "后端当前未启用该缓存" : undefined}
                                                onClick={() => askPurge(action)}
                                            >
                                                <Trash2 className="size-3.5" />
                                                {busy === `清理${action.title}` ? "清理中…" : "清理"}
                                            </Button>
                                        </div>
                                    );
                                })}
                            </div>
                        </section>

                        <p className="text-xs text-muted-foreground/70">
                            状态字段以远端 GET /api/admin/cache/status 返回为准；缺失字段显示为 —。
                            写操作（重新验证 / 清理）会真实改动线上缓存的可用状态，请谨慎执行。
                        </p>
                    </div>
                )}
            </div>

            {/* ===== 二次确认对话框：所有写操作的唯一入口 ===== */}
            {pending && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
                    onMouseDown={() => {
                        if (!busy) setPending(null);
                    }}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-label={pending.title}
                        className="w-full max-w-md rounded-xl border bg-card p-5 shadow-xl"
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-start gap-3">
                            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-destructive/10">
                                <AlertTriangle className="size-4 text-destructive" />
                            </span>
                            <div className="min-w-0">
                                <h3 className="text-base font-semibold">{pending.title}</h3>
                                <p className="mt-1.5 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
                                    {pending.description}
                                </p>
                            </div>
                        </div>
                        <div className="mt-5 flex justify-end gap-2">
                            <Button variant="outline" disabled={!!busy} onClick={() => setPending(null)}>
                                取消
                            </Button>
                            <Button
                                variant={pending.danger ? "destructive" : "default"}
                                disabled={!!busy}
                                onClick={() => void runAction(pending)}
                            >
                                {busy ? pending.busyLabel : pending.confirmLabel}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
