"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
    Download, Pencil, Plus, RefreshCw, Trash2, Upload
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatStrip } from "@/components/admin/stat-strip";
import { AdminFilterBar } from "@/components/admin/filter-bar";
import { AdminEmptyState } from "@/components/admin/empty-state";
import { StatusDot } from "@/components/admin/status-dot";
import { useConfirm } from "@/components/confirm-provider";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
    createAdminDonationApi,
    deleteAdminDonationApi,
    getAdminDonationsApi,
    getDonationTotalApi,
    updateAdminDonationApi,
} from "@/lib/api";
import {
    MAX_DONATION_IMPORT_SIZE,
    downloadBlobFile,
    exportAdminDonationsApi,
    formatBytes,
    importAdminDonationsApi,
    isSupportedDonationImportFile,
    type DonationImportOptions,
    type DonationImportResult,
} from "@/lib/api-donations-io";
import type { Donation } from "@/types/donations";

const PAGE_SIZE = 10;

/** 导入结果里最多列出多少条失败原因（后端 errors 可能很长） */
const MAX_SHOWN_IMPORT_ERRORS = 8;

/** 导入文件体积上限的可读文案（导入弹窗里展示） */
const MAX_IMPORT_SIZE_TEXT = formatBytes(MAX_DONATION_IMPORT_SIZE);

const STATUS_OPTIONS = [
    { value: "1", label: "显示" },
    { value: "2", label: "隐藏" },
];

/** 状态徽章（1=显示 2=隐藏） */
function statusBadge(status?: number) {
    if (status === 1) return { label: "显示", cls: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400" };
    if (status === 2) return { label: "隐藏", cls: "bg-muted text-muted-foreground" };
    return { label: String(status ?? ""), cls: "bg-muted text-muted-foreground" };
}

/** 时间戳（YYYY-MM-DD HH:MM，本地时区；数据是提交后拉取的，不涉及水合一致性） */
function formatDateTime(iso?: string): string {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** ISO 字符串 → <input type="datetime-local"> 需要的 'YYYY-MM-DDTHH:mm' */
function toDatetimeLocal(iso?: string): string {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 数字展示（保留两位小数） */
function money(value: unknown): string {
    const n = Number(value);
    return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

const EMPTY_FORM = {
    name: "",
    amount: "",
    suffix: "元",
    sort_order: "",
    status: "1",
    custom_published_at: "",
};

/**
 * 打赏管理页：统计磁贴 + 状态筛选 + 列表（多选批量删除）+ 新增/编辑弹窗 + 删除 + 导出/导入。
 * 接口为后端 PRO 模块（/pro/admin/donations），经同源代理 /api/admin/donations 转发。
 */
export function DonationsManager() {
    const [list, setList] = useState<Donation[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [statusFilter, setStatusFilter] = useState(""); // "" 全部
    const [loading, setLoading] = useState(true);
    const [refreshKey, setRefreshKey] = useState(0);
    /** 打赏总额（独立接口，统计磁贴用） */
    const [totalAmount, setTotalAmount] = useState(0);

    /** 多选（批量删除） */
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [deleting, setDeleting] = useState(false);

    // ===== 导出 / 导入 =====
    const [exporting, setExporting] = useState(false);
    const [importOpen, setImportOpen] = useState(false);
    const [importFile, setImportFile] = useState<File | null>(null);
    /** 导入结果是只读的，单独存一份避免重渲染被擦掉 */
    const [importResult, setImportResult] = useState<DonationImportResult | null>(null);
    const [importing, setImporting] = useState(false);
    const [importOptions, setImportOptions] = useState<DonationImportOptions>({
        // 与官方 DonationImportDialog.tsx:98-99 的默认值一致
        skipExisting: true,
        defaultStatus: 0,
    });
    const importInputRef = useRef<HTMLInputElement | null>(null);

    // ===== 新增 / 编辑弹窗 =====
    const [editing, setEditing] = useState<Donation | null>(null);
    const [createOpen, setCreateOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({ ...EMPTY_FORM });

    // 应用内确认弹窗（替代 window.confirm，见 components/confirm-provider.tsx）
    const confirm = useConfirm();

    const closeDialog = () => {
        setEditing(null);
        setCreateOpen(false);
    };

    const openCreate = () => {
        setEditing(null);
        setForm({ ...EMPTY_FORM });
        setCreateOpen(true);
    };

    const openEdit = (item: Donation) => {
        setEditing(item);
        setForm({
            name: item.name || "",
            amount: item.amount === undefined || item.amount === null ? "" : String(item.amount),
            suffix: item.suffix || "元",
            sort_order: item.sort_order ? String(item.sort_order) : "",
            status: String(item.status ?? 1),
            custom_published_at: toDatetimeLocal(item.custom_published_at),
        });
    };

    // 状态筛选变化时回到第一页
    useEffect(() => {
        const timer = setTimeout(() => setPage(1), 0);
        return () => clearTimeout(timer);
    }, [statusFilter]);

    // 拉取打赏列表（浏览器自动携带登录 cookie）
    useEffect(() => {
        let cancelled = false;
        const timer = setTimeout(() => setLoading(true), 0);
        getAdminDonationsApi({
            page,
            page_size: PAGE_SIZE,
            status: statusFilter ? Number(statusFilter) : undefined,
        })
            .then((data) => {
                if (cancelled) return;
                setList(data.list ?? []);
                setTotal(data.total ?? 0);
            })
            .catch((e) => {
                if (!cancelled) toast.error(e instanceof Error ? e.message : "打赏列表加载失败");
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
    }, [page, statusFilter, refreshKey]);

    // 总额随列表刷新一起重拉（成功/失败都不打断列表：失败按 0 处理，磁贴显示 0.00）。
    // 注意 setState 要写在 then/catch 回调里，不能在 effect 里同步调用一个含 setState 的函数
    // （否则触发 react-hooks/set-state-in-effect 的级联渲染告警）。
    useEffect(() => {
        let cancelled = false;
        getDonationTotalApi()
            .then((data) => {
                if (!cancelled) setTotalAmount(Number(data?.total_amount ?? 0));
            })
            .catch(() => {
                if (!cancelled) setTotalAmount(0);
            });
        return () => {
            cancelled = true;
        };
    }, [refreshKey]);

    const handleSave = async () => {
        const amount = Number(form.amount);
        if (!form.name.trim()) {
            toast.error("请填写打赏者昵称");
            return;
        }
        if (!Number.isFinite(amount) || amount < 0) {
            toast.error("请填写有效金额（不小于 0）");
            return;
        }
        const payload = {
            name: form.name.trim(),
            amount,
            suffix: form.suffix.trim() || "元",
            status: Number(form.status) || 1,
            sort_order: form.sort_order ? Number(form.sort_order) : undefined,
            custom_published_at: form.custom_published_at || undefined,
        };
        setSaving(true);
        try {
            if (editing) {
                await updateAdminDonationApi(editing.id, payload);
                toast.success("打赏记录已更新");
            } else {
                await createAdminDonationApi(payload);
                toast.success("打赏记录已创建");
            }
            closeDialog();
            setRefreshKey((k) => k + 1);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : editing ? "更新失败" : "创建失败");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (item: Donation) => {
        if (!(await confirm({ title: `确定删除「${item.name || "该"}」的打赏记录吗？`, description: "删除后不可恢复。", danger: true }))) return;
        try {
            await deleteAdminDonationApi(item.id);
            toast.success("打赏记录已删除");
            setSelected((prev) => {
                const next = new Set(prev);
                next.delete(item.id);
                return next;
            });
            // 删掉当前页最后一条且不在第一页时回退一页，避免停在空页
            if (list.length === 1 && page > 1) setPage((p) => p - 1);
            else setRefreshKey((k) => k + 1);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "删除失败");
        }
    };

    /** 批量删除：后端没有批量端点，逐条 DELETE（与官方实现一致） */
    const handleBatchDelete = async () => {
        const ids = [...selected];
        if (ids.length === 0) return;
        if (!(await confirm({ title: `确定删除选中的 ${ids.length} 条打赏记录吗？`, description: "删除后不可恢复。", danger: true }))) return;
        setDeleting(true);
        let ok = 0;
        const failed: string[] = [];
        for (const id of ids) {
            try {
                await deleteAdminDonationApi(id);
                ok += 1;
            } catch (e) {
                failed.push(e instanceof Error ? e.message : `#${id} 删除失败`);
            }
        }
        setDeleting(false);
        setSelected(new Set());
        if (failed.length === 0) {
            toast.success(`已删除 ${ok} 条打赏记录`);
        } else {
            toast.error(`删除 ${ok} 条成功，${failed.length} 条失败：${failed[0]}`);
        }
        if (list.length === ok && page > 1) setPage((p) => p - 1);
        else setRefreshKey((k) => k + 1);
    };

    /**
     * 导出打赏记录：勾选了就只导出勾选的那几条，没勾选就导出全部。
     * 远端回的是文件流（官方下载名 donations-YYYY-MM-DD.json），这里优先用远端的
     * Content-Disposition 文件名，取不到再按日期兜底。
     */
    const handleExport = async () => {
        const ids = [...selected];
        setExporting(true);
        try {
            const { blob, filename } = await exportAdminDonationsApi(ids);
            const fallback = `donations-${new Date().toISOString().slice(0, 10)}.json`;
            downloadBlobFile(blob, filename || fallback);
            toast.success(ids.length > 0 ? `已导出选中的 ${ids.length} 条打赏记录` : "已导出全部打赏记录", {
                description: "JSON 文件可直接在「导入」里回灌",
            });
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "导出失败");
        } finally {
            setExporting(false);
        }
    };

    /** 关闭导入弹窗时清空选择与上一次结果（避免下次打开看到旧结果） */
    const resetImport = () => {
        setImportFile(null);
        setImportResult(null);
        if (importInputRef.current) importInputRef.current.value = "";
    };

    /** 选择文件时就地校验扩展名与体积，不合格立即提示并清空 */
    const handlePickImportFile = (file: File | undefined) => {
        if (!file) return;
        if (!isSupportedDonationImportFile(file.name)) {
            toast.error("只支持 .json（或 .txt）文件");
            resetImport();
            return;
        }
        if (file.size > MAX_DONATION_IMPORT_SIZE) {
            toast.error(`文件不能超过 ${MAX_IMPORT_SIZE_TEXT}`, { description: `当前 ${formatBytes(file.size)}` });
            resetImport();
            return;
        }
        setImportFile(file);
        setImportResult(null);
    };

    /** 真正提交导入（已过二次确认）——⚠️ 写库，不可撤销 */
    const handleImport = async () => {
        if (!importFile) return;
        setImporting(true);
        setImportResult(null);
        try {
            const res = await importAdminDonationsApi(importFile, importOptions);
            setImportResult(res);
            if (res.success_count > 0) {
                toast.success(`导入完成：成功 ${res.success_count} 条`);
                setRefreshKey((k) => k + 1);
            } else if (res.failed_count > 0) {
                toast.warning("没有成功导入任何记录，看看下方失败原因");
            } else {
                toast.info("没有新增记录（可能都被跳过了）");
            }
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "导入失败");
        } finally {
            setImporting(false);
        }
    };

    /** 二次确认：导入会往打赏表写数据，文案里写清后果 */
    const confirmImport = async () => {
        if (!importFile) return;
        const ok = await confirm({
            title: "确定导入吗？",
            description:
                `文件：${importFile.name}\n\n` +
                `这会向打赏记录表写入数据（不可撤销）。\n` +
                `已存在的记录：${importOptions.skipExisting ? "跳过" : "不判重，可能产生重复"}\n` +
                `默认状态：${
                    importOptions.defaultStatus === 0
                        ? "保持原状态"
                        : importOptions.defaultStatus === 1
                          ? "统一设为显示"
                          : "统一设为隐藏"
                }`,
        });
        if (!ok) return;
        void handleImport();
    };

    const allSelected = list.length > 0 && list.every((item) => selected.has(item.id));
    const toggleAll = () => {
        setSelected(allSelected ? new Set() : new Set(list.map((item) => item.id)));
    };
    const toggleOne = (id: number) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const pageAmount = list.reduce((acc, item) => acc + Number(item.amount || 0), 0);
    const visibleCount = list.filter((item) => item.status === 1).length;

    // 任何宽度都用同一套列模板：窄屏靠 .admin-scroll 横向滚动、操作列 sticky 固定，不再折成卡片。
    // 窄屏也保持 min-w：整张表横向滚动，列不会被压扁。
    const rowGrid = "grid-cols-[16px_minmax(0,1fr)_112px_48px_144px_64px_80px]";
    const rowMinW = "min-w-[820px]";

    return (
        // admin-card：吃掉剩余高度，列表区域（admin-scroll）在卡片内部滚动，不再顶高整页
        <div className="admin-card">
            {/* 统计磁贴：固定在卡片顶部（shrink-0），不随列表滚动 */}
            <StatStrip
                items={[
                { label: "总记录数", value: <>{total}</> },
                { label: "累计打赏", value: <>¥{money(totalAmount)}</> },
                { label: "当前页金额", value: <>¥{money(pageAmount)}</> },
                { label: "当前页显示中", value: <>{visibleCount}</> },
                ]}
            />

            {/* 工具栏：统一工具条，固定在卡片顶部（shrink-0），不随下方列表滚动 */}
            <AdminFilterBar
                onReset={() => setStatusFilter("")}
                resetDisabled={!statusFilter}
                summary={
                    <>
                        共 <span className="font-medium text-foreground">{total}</span> 条打赏记录
                    </>
                }
            >
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        状态
                        <Select value={statusFilter || "all"} onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}>
                            <SelectTrigger className="h-7 w-full text-xs sm:w-max">
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
                <div className="col-span-2 order-last flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
                    {selected.size > 0 && (
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={deleting}
                            className="h-7 shrink-0 px-2 text-xs text-red-600 hover:text-red-600 dark:text-red-400"
                            onClick={handleBatchDelete}
                        >
                            <Trash2 className="size-3.5" />
                            <span className="hidden sm:inline">
                                {deleting ? "删除中…" : `批量删除（${selected.size}）`}
                            </span>
                        </Button>
                    )}
                    {/* 导出：勾选了就导出勾选的，没勾选就导出全部（远端 GET export 的语义） */}
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={exporting}
                        className="h-7 shrink-0 px-2 text-xs"
                        title={selected.size > 0 ? `导出已勾选的 ${selected.size} 条` : "未勾选任何记录时导出全部"}
                        onClick={handleExport}
                    >
                        <Download className="size-3.5" />
                        <span className="hidden sm:inline">
                            {exporting ? "导出中…" : selected.size > 0 ? `导出（${selected.size}）` : "导出"}
                        </span>
                    </Button>
                    {/* 导入：弹窗内选文件 + 二次确认；导入会批量写打赏表 */}
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={importing}
                        className="h-7 shrink-0 px-2 text-xs"
                        title="从 JSON 文件导入打赏记录"
                        onClick={() => {
                            resetImport();
                            setImportOpen(true);
                        }}
                    >
                        <Upload className="size-3.5" />
                        <span className="hidden sm:inline">导入</span>
                    </Button>
                    <Button
                        size="sm"
                        className="h-7 shrink-0 bg-primary px-2 text-xs text-primary-foreground hover:bg-primary/90"
                        onClick={openCreate}
                    >
                        <Plus className="size-3.5" />
                        <span className="hidden sm:inline">新增打赏</span>
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-7 shrink-0 px-2 text-xs"
                        onClick={() => setRefreshKey((k) => k + 1)}
                    >
                        <RefreshCw className="size-3.5" />
                        <span className="hidden sm:inline">刷新</span>
                    </Button>
                </div>
            </AdminFilterBar>

            {/* 列表：卡片内唯一滚动区（表头吸顶），工具栏与分页都不动 */}
            <div className="admin-scroll">
                {/* 表头：任何宽度都显示（窄屏横向滚动时需要列名） */}
                <div className={`admin-sticky-head admin-list-head items-center gap-3 border-b px-4 py-2.5 text-xs font-medium text-muted-foreground grid ${rowMinW} ${rowGrid}`}>
                    <span className="flex items-center">
                        <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="全选本页" />
                    </span>
                    <span>昵称</span>
                    <span>金额</span>
                    <span className="text-center">排序</span>
                    <span>打赏时间</span>
                    <span className="text-center">状态</span>
                    <span className="text-right">操作</span>
                </div>

                {loading ? (
                    <div className="py-12 text-center text-sm text-muted-foreground">加载中…</div>
                ) : list.length === 0 ? (
                    <AdminEmptyState
                        kind="orders"
                        filtered={Boolean(statusFilter)}
                        title={statusFilter ? undefined : "还没有打赏记录"}
                        description={
                            statusFilter ? undefined : "打赏到账后会逐条记在这里，也可以手动补录一笔"
                        }
                    />
                ) : (
                    list.map((item) => {
                        const badge = statusBadge(item.status);
                        return (
                            <div
                                key={item.id}
                                className={`grid admin-list-row items-center gap-x-3 gap-y-2 border-b px-4 py-3 text-sm transition-colors last:border-b-0 hover:bg-muted/40 sm:gap-y-1 ${rowMinW} ${rowGrid}`}
                            >
                                <span className="flex items-center gap-2">
                                    <Checkbox
                                        checked={selected.has(item.id)}
                                        onCheckedChange={() => toggleOne(item.id)}
                                        aria-label={`选择 ${item.name}`}
                                    />
                                </span>
                                <div className="min-w-0">
                                    <div className="truncate font-medium text-foreground">{item.name || "—"}</div>
                                </div>
                                <div>
                                    <span className="font-semibold tabular-nums text-primary">
                                        {money(item.amount)}
                                    </span>
                                    <span className="ml-1 text-xs text-muted-foreground">{item.suffix || "元"}</span>
                                </div>
                                <div className="text-xs tabular-nums text-muted-foreground sm:text-center">
                                    {/* 裸数字脱离表头看不懂，窄屏补个前缀 */}
                                    {item.sort_order || 0}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                    {formatDateTime(item.custom_published_at || item.created_at)}
                                </div>
                                <div className="sm:text-center">
                                    <StatusDot cls={badge.cls}>{badge.label}</StatusDot>
                                </div>
                                <div className="flex items-center gap-1 sm:justify-end">
                                    <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        aria-label="编辑"
                                        title="编辑"
                                        className={ACTION_TONE.edit}
                                        onClick={() => openEdit(item)}
                                    >
                                        <Pencil className="size-4" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        aria-label="删除"
                                        title="删除"
                                        className={ACTION_TONE.delete}
                                        onClick={() => handleDelete(item)}
                                    >
                                        <Trash2 className="size-4" />
                                    </Button>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* 分页：固定在卡片底部，不随列表滚动 */}
            <div className="flex shrink-0 items-center justify-between gap-3 border-t bg-muted/40 px-4 py-2.5 text-xs text-muted-foreground">
                <span>
                    第 {page} / {totalPages} 页
                </span>
                <PaginationControls page={page} totalPages={totalPages} onPageChange={setPage} disabled={loading} />
            </div>

            {/* ===== 新增 / 编辑弹窗 ===== */}
            {(editing || createOpen) && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
                    onMouseDown={closeDialog}
                >
                    <div
                        className="w-full max-w-xl soft-surface p-5 shadow-xl"
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        <div className="mb-4 flex items-center justify-between">
                            <h3 className="text-base font-semibold">
                                {editing ? `编辑打赏记录 #${editing.id}` : "新增打赏记录"}
                            </h3>
                            <button
                                type="button"
                                onClick={closeDialog}
                                aria-label="关闭"
                                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                                <label className="block">
                                    <span className="mb-1 block text-xs font-medium text-muted-foreground">昵称（必填）</span>
                                    <Input
                                        value={form.name}
                                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                                        placeholder="打赏者昵称"
                                    />
                                </label>
                                <label className="block">
                                    <span className="mb-1 block text-xs font-medium text-muted-foreground">金额（必填）</span>
                                    <Input
                                        type="number"
                                        min={0}
                                        value={form.amount}
                                        onChange={(e) => setForm({ ...form, amount: e.target.value })}
                                        placeholder="0.00"
                                    />
                                </label>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <label className="block">
                                    <span className="mb-1 block text-xs font-medium text-muted-foreground">金额后缀</span>
                                    <Input
                                        value={form.suffix}
                                        onChange={(e) => setForm({ ...form, suffix: e.target.value })}
                                        placeholder="如 元 / CNY"
                                    />
                                </label>
                                <label className="block">
                                    <span className="mb-1 block text-xs font-medium text-muted-foreground">排序值</span>
                                    <Input
                                        type="number"
                                        value={form.sort_order}
                                        onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
                                        placeholder="越小越靠前"
                                    />
                                </label>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <label className="block">
                                    <span className="mb-1 block text-xs font-medium text-muted-foreground">状态</span>
                                    <Select
                                        value={form.status}
                                        onValueChange={(v) => setForm({ ...form, status: v })}
                                    >
                                        <SelectTrigger className="w-full">
                                            <SelectValue placeholder="选择状态" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {STATUS_OPTIONS.map((o) => (
                                                <SelectItem key={o.value} value={o.value}>
                                                    {o.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </label>
                                <label className="block">
                                    <span className="mb-1 block text-xs font-medium text-muted-foreground">
                                        自定义发布时间
                                    </span>
                                    <Input
                                        type="datetime-local"
                                        value={form.custom_published_at}
                                        onChange={(e) => setForm({ ...form, custom_published_at: e.target.value })}
                                    />
                                </label>
                            </div>
                            <p className="text-xs text-muted-foreground/70">
                                留空「自定义发布时间」则按创建时间展示。
                            </p>
                            <div className="flex justify-end gap-2 pt-2">
                                <Button variant="outline" onClick={closeDialog}>
                                    取消
                                </Button>
                                <Button onClick={handleSave} disabled={saving}>
                                    {saving ? "保存中…" : editing ? "保存修改" : "创建记录"}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ===== 导入打赏记录弹窗（⚠️ 写库，需二次确认） ===== */}
            {importOpen && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
                    // 请求在途时锁住遮罩点击，避免关掉弹窗后结果无处安放
                    onMouseDown={() => {
                        if (!importing) {
                            setImportOpen(false);
                            resetImport();
                        }
                    }}
                >
                    <div
                        className="w-full max-w-xl soft-surface p-4 shadow-xl"
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        <div className="mb-3 flex items-center justify-between">
                            <h3 className="text-base font-semibold">导入打赏记录</h3>
                            <button
                                type="button"
                                disabled={importing}
                                onClick={() => {
                                    setImportOpen(false);
                                    resetImport();
                                }}
                                aria-label="关闭"
                                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="space-y-3 text-sm">
                            <p className="text-xs text-muted-foreground">
                                支持 <code>.json</code>（「导出」得到的文件）：顶层为{" "}
                                <code>{`{ donations: [...] }`}</code> 或直接是数组。单文件不超过{" "}
                                {MAX_IMPORT_SIZE_TEXT}。导入会写入打赏记录表，请先确认文件内容。
                            </p>

                            {/* 文件选择 */}
                            <div className="flex flex-wrap items-center gap-2">
                                <input
                                    ref={importInputRef}
                                    type="file"
                                    accept=".json,.txt,application/json"
                                    className="hidden"
                                    onChange={(e) => handlePickImportFile(e.target.files?.[0])}
                                />
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={importing}
                                    onClick={() => importInputRef.current?.click()}
                                >
                                    <Upload className="size-3.5" />
                                    选择文件
                                </Button>
                                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                                    {importFile
                                        ? `${importFile.name}（${formatBytes(importFile.size)}）`
                                        : "未选择文件"}
                                </span>
                                {importFile && (
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 text-xs"
                                        disabled={importing}
                                        onClick={resetImport}
                                    >
                                        清空
                                    </Button>
                                )}
                            </div>

                            {/* 导入选项：字段名与官方一致（skip_existing / default_status） */}
                            <div className="space-y-2 rounded-lg border p-3">
                                <label className="flex cursor-pointer items-start gap-2 text-xs">
                                    <Checkbox
                                        className="mt-0.5"
                                        checked={importOptions.skipExisting}
                                        disabled={importing}
                                        onCheckedChange={(v) =>
                                            setImportOptions({ ...importOptions, skipExisting: v === true })
                                        }
                                    />
                                    <span>跳过已存在的记录</span>
                                </label>
                                <div className="flex items-center gap-2 text-xs">
                                    <span>文件里没写状态的记录导入为</span>
                                    <Select
                                        value={String(importOptions.defaultStatus)}
                                        disabled={importing}
                                        onValueChange={(v) => {
                                            const n = Number(v);
                                            setImportOptions({
                                                ...importOptions,
                                                defaultStatus: n === 1 ? 1 : n === 2 ? 2 : 0,
                                            });
                                        }}
                                    >
                                        <SelectTrigger className="h-7 w-max text-xs">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="0">保持原状态</SelectItem>
                                            <SelectItem value="1">统一设为显示</SelectItem>
                                            <SelectItem value="2">统一设为隐藏</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            {/* 导入结果（官方 ImportDonationResult） */}
                            {importResult && (
                                <div className="space-y-2 rounded-lg border p-3 text-xs">
                                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                                        <span>共 {importResult.total_count} 条</span>
                                        <span className="text-emerald-600 dark:text-emerald-400">
                                            成功 {importResult.success_count}
                                        </span>
                                        <span
                                            className={
                                                importResult.failed_count > 0
                                                    ? "text-destructive"
                                                    : "text-muted-foreground"
                                            }
                                        >
                                            失败 {importResult.failed_count}
                                        </span>
                                        <span className="text-muted-foreground">
                                            跳过 {importResult.skipped_count}
                                        </span>
                                    </div>
                                    {(importResult.errors?.length ?? 0) > 0 && (
                                        <ul className="max-h-32 space-y-1 overflow-y-auto text-muted-foreground">
                                            {importResult.errors
                                                ?.slice(0, MAX_SHOWN_IMPORT_ERRORS)
                                                .map((msg, i) => (
                                                    <li key={`${i}-${msg}`}>
                                                        <span className="text-destructive">失败</span> {msg}
                                                    </li>
                                                ))}
                                            {(importResult.errors?.length ?? 0) > MAX_SHOWN_IMPORT_ERRORS && (
                                                <li>
                                                    …还有{" "}
                                                    {(importResult.errors?.length ?? 0) - MAX_SHOWN_IMPORT_ERRORS} 条
                                                </li>
                                            )}
                                        </ul>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="mt-4 flex justify-end gap-2">
                            <Button
                                variant="outline"
                                disabled={importing}
                                onClick={() => {
                                    setImportOpen(false);
                                    resetImport();
                                }}
                            >
                                关闭
                            </Button>
                            <Button disabled={importing || !importFile} onClick={confirmImport}>
                                {importing ? "导入中…" : "开始导入"}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
