"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Gift, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
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
import type { Donation } from "@/types/donations";

const PAGE_SIZE = 10;

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
 * 打赏管理页：统计磁贴 + 状态筛选 + 列表（多选批量删除）+ 新增/编辑弹窗 + 删除。
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

    // ===== 新增 / 编辑弹窗 =====
    const [editing, setEditing] = useState<Donation | null>(null);
    const [createOpen, setCreateOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({ ...EMPTY_FORM });

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
        if (!window.confirm(`确定删除「${item.name || "该"}」的打赏记录吗？\n删除后不可恢复。`)) return;
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
        if (!window.confirm(`确定删除选中的 ${ids.length} 条打赏记录吗？\n删除后不可恢复。`)) return;
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

    return (
        <div className="mt-4">
            {/* 统计磁贴 */}
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                <div className="rounded-lg border bg-card px-3 py-2">
                    <p className="text-xs text-muted-foreground">总记录数</p>
                    <p className="text-lg font-semibold tabular-nums">{total}</p>
                </div>
                <div className="rounded-lg border bg-card px-3 py-2">
                    <p className="text-xs text-muted-foreground">累计打赏</p>
                    <p className="text-lg font-semibold tabular-nums text-primary">¥{money(totalAmount)}</p>
                </div>
                <div className="rounded-lg border bg-card px-3 py-2">
                    <p className="text-xs text-muted-foreground">当前页金额</p>
                    <p className="text-lg font-semibold tabular-nums text-green-600 dark:text-green-400">
                        ¥{money(pageAmount)}
                    </p>
                </div>
                <div className="rounded-lg border bg-card px-3 py-2">
                    <p className="text-xs text-muted-foreground">当前页显示中</p>
                    <p className="text-lg font-semibold tabular-nums text-orange-600 dark:text-orange-400">
                        {visibleCount}
                    </p>
                </div>
            </div>

            {/* 列表卡片 */}
            <div className="mt-3 overflow-x-auto rounded-lg border bg-card shadow-sm">
                <div className="flex min-w-[820px] flex-wrap items-center justify-between gap-3 border-b bg-slate-50 px-4 py-2.5 dark:bg-muted/30">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            状态
                            <Select value={statusFilter || "all"} onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}>
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
                        <span className="text-xs text-muted-foreground">
                            共 <span className="font-medium text-foreground">{total}</span> 条打赏记录
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        {selected.size > 0 && (
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={deleting}
                                className="h-7 px-2 text-xs text-red-600 hover:text-red-600 dark:text-red-400"
                                onClick={handleBatchDelete}
                            >
                                <Trash2 className="size-3.5" />
                                {deleting ? "删除中…" : `批量删除（${selected.size}）`}
                            </Button>
                        )}
                        <Button
                            size="sm"
                            className="h-7 px-2 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
                            onClick={openCreate}
                        >
                            <Plus className="size-3.5" />
                            新增打赏
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => setRefreshKey((k) => k + 1)}
                        >
                            <RefreshCw className="size-3.5" />
                            刷新
                        </Button>
                    </div>
                </div>

                {/* 表头（与工具栏同宽：窄屏整表横向滚动，避免右侧列挤压左侧列） */}
                <div className="flex min-w-[820px] items-center gap-3 whitespace-nowrap border-b bg-slate-50 px-4 py-2.5 text-xs font-medium text-muted-foreground dark:bg-muted/30">
                    <span className="flex w-4 shrink-0 items-center">
                        <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="全选本页" />
                    </span>
                    <span className="min-w-0 flex-1">昵称</span>
                    <div className="ml-auto flex shrink-0 items-center gap-3">
                        <span className="w-28 shrink-0">金额</span>
                        <span className="w-12 shrink-0 text-center">排序</span>
                        <span className="w-36 shrink-0">打赏时间</span>
                        <span className="w-16 shrink-0 text-center">状态</span>
                        <span className="w-20 shrink-0 text-right">操作</span>
                    </div>
                </div>

                {loading ? (
                    <div className="py-12 text-center text-sm text-muted-foreground">加载中…</div>
                ) : list.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-1.5 py-12 text-sm text-muted-foreground">
                        <Gift className="size-5 opacity-60" />
                        <span>{statusFilter ? "没有匹配的打赏记录" : "暂无打赏记录，点击「新增打赏」创建第一条"}</span>
                    </div>
                ) : (
                    list.map((item) => {
                        const badge = statusBadge(item.status);
                        return (
                            <div
                                key={item.id}
                                className="flex min-w-[820px] items-center gap-3 whitespace-nowrap border-b px-4 py-3 text-sm last:border-b-0 hover:bg-muted/40"
                            >
                                <span className="flex w-4 shrink-0 items-center">
                                    <Checkbox
                                        checked={selected.has(item.id)}
                                        onCheckedChange={() => toggleOne(item.id)}
                                        aria-label={`选择 ${item.name}`}
                                    />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <div className="truncate font-medium text-foreground">{item.name || "—"}</div>
                                </div>
                                <div className="ml-auto flex shrink-0 items-center gap-3">
                                    <div className="w-28 shrink-0">
                                        <span className="font-semibold tabular-nums text-primary">
                                            {money(item.amount)}
                                        </span>
                                        <span className="ml-1 text-xs text-muted-foreground">{item.suffix || "元"}</span>
                                    </div>
                                    <div className="w-12 shrink-0 text-center text-xs tabular-nums text-muted-foreground">
                                        {item.sort_order || 0}
                                    </div>
                                    <div className="w-36 shrink-0 text-xs text-muted-foreground">
                                        {formatDateTime(item.custom_published_at || item.created_at)}
                                    </div>
                                    <div className="w-16 shrink-0 text-center">
                                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}>
                                            {badge.label}
                                        </span>
                                    </div>
                                    <div className="flex w-20 shrink-0 items-center justify-end gap-1">
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
                            </div>
                        );
                    })
                )}

                {/* 分页 */}
                <div className="flex items-center justify-between gap-3 border-t bg-slate-50 px-4 py-2.5 text-xs text-muted-foreground dark:bg-muted/30">
                    <span>
                        第 {page} / {totalPages} 页
                    </span>
                    <PaginationControls page={page} totalPages={totalPages} onPageChange={setPage} disabled={loading} />
                </div>
            </div>

            {/* ===== 新增 / 编辑弹窗 ===== */}
            {(editing || createOpen) && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
                    onMouseDown={closeDialog}
                >
                    <div
                        className="w-full max-w-xl rounded-xl border bg-card p-5 shadow-xl"
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
        </div>
    );
}
