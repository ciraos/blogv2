"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
    Clock,
    DatabaseBackup,
    Download,
    Eraser,
    HardDrive,
    LoaderCircle,
    Plus,
    RefreshCw,
    RotateCcw,
    ServerCrash,
    Sparkles,
    Trash2,
    Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatStrip } from "@/components/admin/stat-strip";
import { AdminFilterBar } from "@/components/admin/filter-bar";
import { AdminEmptyState } from "@/components/admin/empty-state";
import { Input } from "@/components/ui/input";
import { ACTION_TONE } from "@/lib/action-tones";
import {
    cleanConfigBackupsApi,
    createConfigBackupApi,
    deleteConfigBackupApi,
    exportConfigApi,
    importConfigApi,
    listConfigBackupsApi,
    restoreConfigBackupApi,
    type ConfigBackupInfo,
} from "@/lib/api-config-backup";

/* =============================================================================
 * 配置备份与迁移（读写接口全部接入）
 *
 * 接口（同源代理 → 远端，全部需管理员登录；源码证据见 src/lib/api-config-backup.ts 顶部注释）：
 *  - GET  /api/admin/config/backup/list     备份列表（data 为 BackupInfo[]）
 *  - POST /api/admin/config/backup/create   创建备份 { description }
 *  - POST /api/admin/config/backup/restore  恢复备份 { filename }（⚠️ 覆盖当前配置）
 *  - POST /api/admin/config/backup/delete   删除备份 { filename }（⚠️ 不可恢复）
 *  - POST /api/admin/config/backup/clean    清理旧备份 { keep_count }（1~100）
 *  - GET  /api/admin/config/export          导出配置（文件流下载）
 *  - POST /api/admin/config/import          导入配置（multipart file，⚠️ 写库）
 *
 * 安全约定：导入 / 恢复都是「写整站配置」的高危操作，均需二次确认，且确认文案里
 * 明确写出后果（覆盖范围、能否找回、是否会自动备份）。删除备份同样二次确认。
 * 本页所有请求都走同源代理，浏览器端不直连线上后端。
 * ========================================================================== */

/** 远端导出接口的导入大小上限（与后端 import_export_handler.go:90 一致） */
const MAX_IMPORT_SIZE = 10 * 1024 * 1024;

/** 字节数 → 人类可读 */
function formatBytes(bytes?: number): string {
    if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) return "—";
    if (bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let value = bytes;
    let i = 0;
    while (value >= 1024 && i < units.length - 1) {
        value /= 1024;
        i += 1;
    }
    return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/** RFC3339 → YYYY-MM-DD HH:MM（本地时区；数据来自接口，不参与 SSR，无水合问题） */
function formatDateTime(iso?: string): string {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 用浏览器下载一个 blob（导出配置用） */
function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // 立刻回收会让部分浏览器取消下载，交回事件循环后释放更稳
    setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * 轻量确认弹窗（admin 没有 dialog 组件，沿用「固定遮罩 + 卡片」的项目内做法）。
 * busy 非空时锁住所有出口（遮罩点击 / 取消 / 确认），避免请求在途时关掉弹窗造成状态错乱。
 */
function ConfirmDialog({
    open,
    title,
    confirmText,
    busy = false,
    destructive = false,
    confirmDisabled = false,
    onCancel,
    onConfirm,
    children,
}: {
    open: boolean;
    title: string;
    confirmText: string;
    busy?: boolean;
    destructive?: boolean;
    confirmDisabled?: boolean;
    onCancel: () => void;
    onConfirm: () => void;
    children: ReactNode;
}) {
    if (!open) return null;
    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            role="dialog"
            aria-modal="true"
            aria-label={title}
            onMouseDown={busy ? undefined : onCancel}
        >
            <div
                className="w-full max-w-md soft-surface p-4 shadow-xl"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <h3 className="text-base font-semibold">{title}</h3>
                <div className="mt-3 space-y-3 text-sm text-muted-foreground">{children}</div>
                <div className="mt-3 flex justify-end gap-2">
                    <Button variant="outline" size="sm" className="h-8 rounded-lg text-xs" onClick={onCancel} disabled={busy}>
                        取消
                    </Button>
                    <Button
                        variant={destructive ? "destructive" : "default"}
                        size="sm"
                        className="h-8 rounded-lg text-xs"
                        onClick={onConfirm}
                        disabled={busy || confirmDisabled}
                    >
                        {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
                        {busy ? "处理中…" : confirmText}
                    </Button>
                </div>
            </div>
        </div>
    );
}

/** 危险提示条：放在确认弹窗里，视觉上与普通说明区分开 */
function DangerNote({ children }: { children: ReactNode }) {
    return (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {children}
        </div>
    );
}

/**
 * 配置备份与迁移页：统计磁贴 + 工具栏（创建 / 清理 / 导出 / 导入 / 刷新）+ 备份列表 + 确认弹窗。
 * 外壳对齐后台其它列表页：页面不滚，磁贴 / 工具栏固定在卡片上，只有列表区（admin-scroll）内部滚动。
 */
export function BackupManager() {
    const router = useRouter();

    /** 备份列表（远端返回全量数组，无分页） */
    const [list, setList] = useState<ConfigBackupInfo[]>([]);
    const [loading, setLoading] = useState(true);
    /** 非空时列表区显示可重试的错误态（未登录 / 远端异常都走这里，页面不白屏） */
    const [error, setError] = useState<string | null>(null);
    /** 变化即重新拉取列表（刷新按钮、各写操作成功后都会 +1） */
    const [refreshKey, setRefreshKey] = useState(0);
    /** 在途动作名：非空时禁用所有动作按钮，防止并发写 */
    const [busy, setBusy] = useState<string | null>(null);

    /** 创建备份：描述输入框 */
    const [createOpen, setCreateOpen] = useState(false);
    const [createDesc, setCreateDesc] = useState("");
    /** 清理旧备份：保留数量（字符串，便于输入框受控） */
    const [cleanOpen, setCleanOpen] = useState(false);
    const [cleanKeep, setCleanKeep] = useState("5");
    /** 恢复 / 删除的目标备份 */
    const [restoreTarget, setRestoreTarget] = useState<ConfigBackupInfo | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<ConfigBackupInfo | null>(null);
    /** 已选中待导入的配置文件（选中即弹二次确认） */
    const [importFile, setImportFile] = useState<File | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // 拉取列表（浏览器自动携带登录 cookie，由同源代理换成 Bearer）。
    // 延后一个 tick 再 setLoading，避免在 effect 内同步 setState 触发级联渲染。
    useEffect(() => {
        let cancelled = false;
        const timer = setTimeout(() => setLoading(true), 0);
        listConfigBackupsApi()
            .then((rows) => {
                if (cancelled) return;
                setList(Array.isArray(rows) ? rows : []);
                setError(null);
            })
            .catch((e) => {
                if (cancelled) return;
                const msg = e instanceof Error ? e.message : "备份列表加载失败";
                // 出错时清空列表：错误态独占列表区，不残留旧数据
                setList([]);
                setError(msg);
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
    }, [refreshKey]);

    const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

    /** 统一包一层：在途标记 + 失败 toast，避免每个动作重复写 try/catch/finally */
    const runAction = useCallback(async (label: string, action: () => Promise<void>) => {
        setBusy(label);
        try {
            await action();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : `${label}失败`);
        } finally {
            setBusy(null);
        }
    }, []);

    /** 创建备份：描述留空时后端会兜底成「手动备份」 */
    const handleCreate = useCallback(async () => {
        const description = createDesc.trim();
        await runAction("创建备份", async () => {
            const info = await createConfigBackupApi(description);
            toast.success(`备份已创建：${info?.filename ?? "已生成"}`);
            setCreateOpen(false);
            setCreateDesc("");
            refresh();
        });
    }, [createDesc, refresh, runAction]);

    /** 清理旧备份：保留数量按后端口径先校验（整数 1~100） */
    const handleClean = useCallback(async () => {
        const keepCount = Number(cleanKeep);
        if (!Number.isInteger(keepCount) || keepCount < 1 || keepCount > 100) {
            toast.error("保留数量必须是 1~100 的整数");
            return;
        }
        await runAction("清理旧备份", async () => {
            await cleanConfigBackupsApi(keepCount);
            toast.success(`已清理旧备份，仅保留最新 ${keepCount} 个`);
            setCleanOpen(false);
            refresh();
        });
    }, [cleanKeep, refresh, runAction]);

    /**
     * 恢复备份（⚠️ 高危）：成功后刷新列表 —— 后端在恢复前会自动另存一个
     * 「恢复前自动备份」（backup_service.go:186-187），所以列表里会多出一条。
     * router.refresh() 让服务端重新取站点配置（后台布局/站点名可能随之变化）。
     */
    const handleRestore = useCallback(async () => {
        const target = restoreTarget;
        if (!target) return;
        await runAction("恢复备份", async () => {
            await restoreConfigBackupApi(target.filename);
            toast.success(`已从「${target.filename}」恢复配置，请刷新页面查看最新效果`);
            setRestoreTarget(null);
            refresh();
            router.refresh();
        });
    }, [refresh, restoreTarget, router, runAction]);

    /** 删除备份（⚠️ 不可恢复） */
    const handleDelete = useCallback(async () => {
        const target = deleteTarget;
        if (!target) return;
        await runAction("删除备份", async () => {
            await deleteConfigBackupApi(target.filename);
            toast.success(`已删除备份「${target.filename}」`);
            setDeleteTarget(null);
            refresh();
        });
    }, [deleteTarget, refresh, runAction]);

    /** 导出配置：远端返回文件流，取回文件名与条目数后由浏览器下载 */
    const handleExport = useCallback(async () => {
        await runAction("导出配置", async () => {
            const result = await exportConfigApi();
            downloadBlob(result.blob, result.filename);
            toast.success(
                result.keysCount !== null ? `已导出 ${result.keysCount} 项配置` : "配置已导出"
            );
        });
    }, [runAction]);

    /** 选择文件：前端按远端口径先校验（.json、≤10MB），通过后弹二次确认 */
    const handlePickFile = useCallback((e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        // 清空 value：同一个文件再次选中也要能触发 change
        e.target.value = "";
        if (!file) return;
        if (!file.name.toLowerCase().endsWith(".json")) {
            toast.error("配置文件必须是 .json 格式");
            return;
        }
        if (file.size > MAX_IMPORT_SIZE) {
            toast.error("配置文件大小不能超过 10MB");
            return;
        }
        setImportFile(file);
    }, []);

    /** 导入配置（⚠️ 高危）：与「恢复」不同，后端导入前**不会**自动备份当前配置 */
    const handleImport = useCallback(async () => {
        const file = importFile;
        if (!file) return;
        await runAction("导入配置", async () => {
            await importConfigApi(file);
            toast.success(`已导入「${file.name}」`);
            setImportFile(null);
            // 导入会改数据库配置，服务端渲染的站点配置需要重取
            router.refresh();
        });
    }, [importFile, router, runAction]);

    /** 磁贴统计：按全量列表聚合；加载中 / 出错时用占位符 */
    const statsReady = !loading && !error;
    const totalSize = list.reduce((sum, item) => sum + (Number.isFinite(item.size) ? item.size : 0), 0);
    /** 列表已按创建时间倒序（后端排序），第一条即最近一次备份 */
    const latest = list[0];
    const tiles = [
        {
            label: "备份数量",
            value: statsReady ? String(list.length) : "—",
            icon: DatabaseBackup,
            tone: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
        },
        {
            label: "占用空间",
            value: statsReady ? formatBytes(totalSize) : "—",
            icon: HardDrive,
            tone: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
        },
        {
            label: "自动备份",
            value: statsReady ? String(list.filter((it) => it.is_auto).length) : "—",
            icon: Sparkles,
            tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
        },
        {
            label: "最近备份",
            value: statsReady && latest ? formatDateTime(latest.created_at) : "—",
            icon: Clock,
            tone: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
        },
    ];

    const actionsDisabled = busy !== null;

    // 任何宽度都用同一套列模板：窄屏靠 .admin-scroll 横向滚动、操作列 sticky 固定，不再折成卡片。
    // 窄屏也保持 min-w：整张表横向滚动，列不会被压扁。
    const rowGrid = "grid-cols-[minmax(0,1.5fr)_88px_144px_minmax(0,1fr)_88px]";
    const rowMinW = "min-w-[860px]";

    return (
        <div className="admin-card">
            {/* 统计磁贴：固定在卡片顶部（shrink-0），不随列表滚动 */}
            <StatStrip items={tiles} />

            {/* 工具栏：统一动作行（左侧说明 + 右侧按钮），固定在卡片顶部（shrink-0） */}
            <AdminFilterBar
                summary={
                    <>
                        共 <span className="font-medium text-foreground">{loading ? "—" : list.length}</span> 个备份
                        <span className="ml-2 text-muted-foreground/70">
                            备份内容为数据库中的系统设置（与「导出配置」一致）
                        </span>
                    </>
                }
                actions={
                    <>
                        <Button
                            size="sm"
                            className="h-8 shrink-0 text-sm"
                            disabled={actionsDisabled}
                            onClick={() => setCreateOpen(true)}
                        >
                            {busy === "创建备份" ? (
                                <LoaderCircle className="size-3.5 animate-spin" />
                            ) : (
                                <Plus className="size-3.5" />
                            )}
                            <span className="hidden sm:inline">创建备份</span>
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8 shrink-0 text-sm"
                            disabled={actionsDisabled}
                            onClick={() => {
                                setCleanKeep("5");
                                setCleanOpen(true);
                            }}
                        >
                            <Eraser className="size-3.5" />
                            <span className="hidden sm:inline">清理旧备份</span>
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8 shrink-0 text-sm"
                            disabled={actionsDisabled}
                            onClick={handleExport}
                        >
                            {busy === "导出配置" ? (
                                <LoaderCircle className="size-3.5 animate-spin" />
                            ) : (
                                <Download className="size-3.5" />
                            )}
                            <span className="hidden sm:inline">导出配置</span>
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8 shrink-0 text-sm"
                            disabled={actionsDisabled}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <Upload className="size-3.5" />
                            <span className="hidden sm:inline">导入配置</span>
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8 shrink-0 text-sm"
                            disabled={actionsDisabled || loading}
                            onClick={refresh}
                        >
                            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
                            <span className="hidden sm:inline">刷新</span>
                        </Button>
                        {/* 导入用的隐藏文件选择框：accept 只是提示，真正的 .json 校验在选中后做 */}
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".json,application/json"
                            className="hidden"
                            onChange={handlePickFile}
                        />
                    </>
                }
            />

            {/* 列表：卡片内唯一滚动区（表头吸顶），磁贴 / 工具栏都不动。
                加载 / 空 / 错误三态都渲染在这个 admin-scroll 里，外壳保持不变 */}
            <div className="admin-scroll">
                {/* 表头：任何宽度都显示（窄屏横向滚动时需要列名） */}
                <div
                    className={`admin-sticky-head admin-list-head items-center gap-3 border-b px-4 py-2 text-xs font-medium text-muted-foreground grid ${rowMinW} ${rowGrid}`}
                >
                    <span>备份文件名</span>
                    <span>大小</span>
                    <span>创建时间</span>
                    <span>描述</span>
                    <span className="text-right">操作</span>
                </div>

                {loading ? (
                    <div aria-busy="true" aria-label="加载中">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <div
                                key={i}
                                className={`grid admin-list-row items-center gap-x-3 gap-y-2 border-b px-4 py-3 sm:gap-y-1 ${rowMinW} ${rowGrid}`}
                            >
                                <div className="h-3 w-40 animate-pulse rounded bg-muted" />
                                <div className="h-3 w-12 animate-pulse rounded bg-muted" />
                                <div className="h-3 w-24 animate-pulse rounded bg-muted" />
                                <div className="h-3 w-28 animate-pulse rounded bg-muted" />
                                <div className="h-6 w-16 animate-pulse rounded bg-muted sm:ml-auto" />
                            </div>
                        ))}
                    </div>
                ) : error ? (
                    // 错误态（未登录 / 远端异常）：消息 + 重试，页面不白屏
                    <div className="flex min-h-64 flex-col items-center justify-center gap-2 px-4 py-8 text-center">
                        <span className="flex size-12 items-center justify-center rounded-full border bg-destructive/10">
                            <ServerCrash className="size-5 text-destructive" />
                        </span>
                        <p className="text-sm font-medium text-destructive">备份列表加载失败</p>
                        <p className="max-w-md text-xs text-muted-foreground">{error}</p>
                        <p className="max-w-md text-xs text-muted-foreground/70">
                            需要管理员登录；若登录已过期，请重新登录后再试
                        </p>
                        <Button variant="outline" size="sm" className="mt-1 h-8 rounded-lg text-xs" onClick={refresh}>
                            <RefreshCw className="size-3.5" />
                            重试
                        </Button>
                    </div>
                ) : list.length === 0 ? (
                    <AdminEmptyState
                        kind="generic"
                        title="还没有配置备份"
                        description="点右上角「创建备份」生成第一份配置备份，或「导入配置」把别处的配置搬过来"
                    />
                ) : (
                    list.map((item) => (
                        <div
                            key={item.filename}
                            className={`grid admin-list-row items-center gap-x-3 gap-y-2 border-b px-4 py-3 text-sm transition-colors last:border-b-0 hover:bg-muted/40 sm:gap-y-1 ${rowMinW} ${rowGrid}`}
                        >
                            <div className="flex min-w-0 items-center gap-2">
                                <DatabaseBackup className="size-4 shrink-0 text-muted-foreground/60" />
                                <span className="truncate font-medium text-foreground" title={item.filename}>
                                    {item.filename || "—"}
                                </span>
                            </div>
                            <div className="text-xs tabular-nums text-muted-foreground">
                                {formatBytes(item.size)}
                            </div>
                            <div className="text-xs tabular-nums text-muted-foreground">
                                {formatDateTime(item.created_at)}
                            </div>
                            <div className="flex min-w-0 items-center gap-1.5">
                                <span className="truncate text-xs text-muted-foreground" title={item.description}>
                                    {item.description || "—"}
                                </span>
                                {item.is_auto && (
                                    <span className="shrink-0 rounded-full bg-violet-500/10 px-2 py-0.5 text-xs font-medium text-violet-600 dark:text-violet-400">
                                        自动
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-1 sm:justify-end">
                                <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label="恢复此备份"
                                    title="恢复此备份（覆盖当前配置）"
                                    className={ACTION_TONE.edit}
                                    disabled={actionsDisabled}
                                    onClick={() => setRestoreTarget(item)}
                                >
                                    <RotateCcw className="size-4" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label="删除此备份"
                                    title="删除此备份"
                                    className={ACTION_TONE.delete}
                                    disabled={actionsDisabled}
                                    onClick={() => setDeleteTarget(item)}
                                >
                                    <Trash2 className="size-4" />
                                </Button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* 卡片底栏：备份数 / 占用空间汇总（固定在底部，不随列表滚动） */}
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
                <span>
                    共 {list.length} 个备份 · 占用 {formatBytes(totalSize)}
                    {latest ? ` · 最近 ${formatDateTime(latest.created_at)}` : ""}
                </span>
                <span className="text-muted-foreground/70">
                    恢复 / 导入属于高危操作，会改写数据库中的系统设置，请先创建备份
                </span>
            </div>

            {/* ===== 创建备份（普通操作，仅收集描述） ===== */}
            <ConfirmDialog
                open={createOpen}
                title="创建配置备份"
                confirmText="创建"
                busy={busy === "创建备份"}
                onCancel={() => setCreateOpen(false)}
                onConfirm={handleCreate}
            >
                <p>将当前数据库中的系统设置导出为一个备份文件，方便随时回滚。</p>
                <label className="block">
                    <span className="mb-1 block text-xs font-medium text-muted-foreground">备份描述（可选）</span>
                    <Input
                        value={createDesc}
                        onChange={(e) => setCreateDesc(e.target.value)}
                        placeholder="留空则记为「手动备份」"
                        maxLength={100}
                        className="h-8 text-xs"
                    />
                </label>
            </ConfirmDialog>

            {/* ===== 清理旧备份（可填保留数量） ===== */}
            <ConfirmDialog
                open={cleanOpen}
                title="清理旧备份"
                confirmText="确认清理"
                destructive
                busy={busy === "清理旧备份"}
                onCancel={() => setCleanOpen(false)}
                onConfirm={handleClean}
            >
                <p>
                    将删除除最新 <span className="font-medium text-foreground">{cleanKeep || "—"}</span> 份之外的
                    全部备份文件。
                </p>
                <label className="block">
                    <span className="mb-1 block text-xs font-medium text-muted-foreground">保留数量（1~100）</span>
                    <Input
                        type="number"
                        min={1}
                        max={100}
                        value={cleanKeep}
                        onChange={(e) => setCleanKeep(e.target.value)}
                        className="h-8 w-28 text-xs"
                    />
                </label>
                <DangerNote>被清理的备份文件会从服务器上删除，之后无法再用它们恢复配置。</DangerNote>
            </ConfirmDialog>

            {/* ===== 恢复备份（⚠️ 高危，二次确认） ===== */}
            <ConfirmDialog
                open={restoreTarget !== null}
                title="恢复配置备份"
                confirmText="确认恢复并覆盖"
                destructive
                busy={busy === "恢复备份"}
                onCancel={() => setRestoreTarget(null)}
                onConfirm={handleRestore}
            >
                <p>
                    将用备份 <span className="font-medium text-foreground">{restoreTarget?.filename}</span>
                    （{formatBytes(restoreTarget?.size)}，{formatDateTime(restoreTarget?.created_at)}）
                    覆盖当前数据库中的<span className="font-medium text-foreground">全部系统设置</span>。
                </p>
                <DangerNote>
                    覆盖后当前配置无法通过「撤销」找回（后端会在恢复前自动另存一份「恢复前自动备份」）。
                    恢复完成后需要刷新页面，站点名称、外观等设置才会显示为新值。
                </DangerNote>
            </ConfirmDialog>

            {/* ===== 删除备份（二次确认） ===== */}
            <ConfirmDialog
                open={deleteTarget !== null}
                title="删除配置备份"
                confirmText="确认删除"
                destructive
                busy={busy === "删除备份"}
                onCancel={() => setDeleteTarget(null)}
                onConfirm={handleDelete}
            >
                <p>
                    将删除备份文件 <span className="font-medium text-foreground">{deleteTarget?.filename}</span>
                    （{formatBytes(deleteTarget?.size)}）。
                </p>
                <DangerNote>删除后该备份无法用于恢复配置，且操作不可撤销。</DangerNote>
            </ConfirmDialog>

            {/* ===== 导入配置（⚠️ 高危，选中文件后二次确认） ===== */}
            <ConfirmDialog
                open={importFile !== null}
                title="导入配置数据"
                confirmText="确认导入并写入"
                destructive
                busy={busy === "导入配置"}
                onCancel={() => setImportFile(null)}
                onConfirm={handleImport}
            >
                <p>
                    将把文件 <span className="font-medium text-foreground">{importFile?.name}</span>
                    （{formatBytes(importFile?.size)}）中的配置项写入数据库：同名键覆盖、新键新增。
                </p>
                <DangerNote>
                    导入会影响整站设置且<span className="font-semibold">不会</span>自动备份当前配置（与「恢复备份」不同）。
                    建议先点「创建备份」留一份当前配置，再执行导入。请确认本文件由本站「导出配置」生成。
                </DangerNote>
            </ConfirmDialog>
        </div>
    );
}
