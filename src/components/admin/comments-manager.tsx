"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
    Check,
    ChevronDown,
    ChevronUp,
    Clock,
    Pencil,
    Pin,
    RefreshCw,
    RotateCcw,
    Search,
    Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { PaginationControls } from "@/components/pagination-controls";
import { ACTION_TONE } from "@/lib/action-tones";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    deleteAdminCommentsApi,
    getAdminCommentsApi,
    toggleAdminCommentPinApi,
    updateAdminCommentInfoApi,
    updateAdminCommentStatusApi,
} from "@/lib/api";
import type { AdminComment, CommentStatus } from "@/types/comments";

const PAGE_SIZE = 10;

const STATUS_OPTIONS = [
    { value: "all", label: "全部状态" },
    { value: "1", label: "已发布" },
    { value: "2", label: "待审核" },
];

/** 筛选表单：输入框里的值只有点「查询」/ 回车后才生效，避免每次输入都打接口 */
interface Filters {
    nickname: string;
    email: string;
    content: string;
    target_path: string;
    status: string; // all | 1 | 2
}

const EMPTY_FILTERS: Filters = { nickname: "", email: "", content: "", target_path: "", status: "all" };

/** 状态徽章（1=已发布 2=待审核） */
function statusBadge(status?: number) {
    if (status === 1) return { label: "已发布", cls: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400" };
    if (status === 2) return { label: "待审核", cls: "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-400" };
    return { label: "未知", cls: "bg-muted text-muted-foreground" };
}

/** 日期（YYYY-MM-DD） */
function formatDate(iso?: string): string {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 时分（HH:MM） */
function formatTime(iso?: string): string {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    const p = (n: number) => String(n).padStart(2, "0");
    return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 评论正文压成一行（列表里用纯文本预览） */
function oneLine(text?: string): string {
    return (text ?? "").replace(/\s+/g, " ").trim();
}

interface RowProps {
    comment: AdminComment;
    /** 0=根评论，>0=子评论（缩进展示） */
    depth: number;
    selected: boolean;
    expanded: boolean;
    /** 正在请求中的评论 id（该行按钮禁用） */
    busyId: string | null;
    onSelect: (id: string) => void;
    onToggleExpand: (id: string) => void;
    onToggleStatus: (comment: AdminComment) => void;
    onTogglePin: (comment: AdminComment) => void;
    onEdit: (comment: AdminComment) => void;
    onDelete: (comment: AdminComment) => void;
}

/** 评论行（根评论 / 子评论共用） */
function CommentRow({
    comment,
    depth,
    selected,
    expanded,
    busyId,
    onSelect,
    onToggleExpand,
    onToggleStatus,
    onTogglePin,
    onEdit,
    onDelete,
}: RowProps) {
    const badge = statusBadge(comment.status);
    const pinned = Boolean(comment.pinned_at);
    const children = comment.children ?? [];
    const childCount = comment.total_children ?? children.length;
    const busy = busyId === comment.id;

    return (
        <div
            className={`flex flex-wrap items-start gap-x-3 gap-y-2 border-b py-3 pr-4 text-sm last:border-b-0 hover:bg-muted/40 xl:flex-nowrap ${
                depth > 0 ? "border-l-2 border-l-primary/20 bg-muted/20 pl-6 xl:pl-10" : "pl-4"
            }`}
        >
            {/* 移动端：勾选框 + 内容独占整行（w-full）；桌面端用 xl:contents 让这层包装消失，
                勾选框与内容恢复成两个独立列（保持原有 1000px 表格排布） */}
            <div className="flex w-full min-w-0 items-start gap-x-3 xl:contents">
                <Checkbox
                    className="mt-0.5"
                    checked={selected}
                    onCheckedChange={() => onSelect(comment.id)}
                    aria-label="选择评论"
                />

                {/* 内容：移动端占满整行（最多 3 行），桌面端限宽 420px、2 行 */}
                <div className="min-w-0 flex-1 max-w-none xl:max-w-[420px]">
                    <div className="line-clamp-3 whitespace-pre-line break-words text-foreground xl:line-clamp-2">
                        {oneLine(comment.content) || "—"}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {comment.is_admin_comment && (
                            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">博主</span>
                        )}
                        {comment.is_anonymous && <span className="rounded bg-muted px-1.5 py-0.5">匿名</span>}
                        {pinned && (
                            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
                                已置顶
                            </span>
                        )}
                        {depth > 0 && comment.reply_to_nick && <span>回复 @{comment.reply_to_nick}</span>}
                        {childCount > 0 &&
                            (children.length > 0 ? (
                                <button
                                    type="button"
                                    onClick={() => onToggleExpand(comment.id)}
                                    className="inline-flex items-center gap-0.5 transition-colors hover:text-foreground"
                                >
                                    {expanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                                    {expanded ? "收起回复" : `展开 ${childCount} 条回复`}
                                </button>
                            ) : (
                                <span>{childCount} 条回复</span>
                            ))}
                    </div>
                </div>
            </div>

            {/* 元信息 + 操作：桌面端靠右成组（xl:ml-auto），移动端自动换行到内容下方（不再横向溢出）。
                移动端每列宽度收窄，评论者/目标各占一半宽度，其余按内容自适应换行 */}
            <div className="w-32 min-w-0 xl:ml-auto xl:w-36">
                <div className="truncate font-medium" title={comment.nickname}>
                    {comment.nickname || "—"}
                </div>
                <div className="truncate text-xs text-muted-foreground" title={comment.email}>
                    {comment.email || "—"}
                </div>
            </div>
            <div className="w-32 min-w-0 xl:w-36">
                <div className="truncate" title={comment.target_title || comment.target_path}>
                    {comment.target_title || "—"}
                </div>
                <div className="truncate text-xs text-muted-foreground" title={comment.target_path}>
                    {comment.target_path || "—"}
                </div>
            </div>
            <div className="w-16 shrink-0 text-center">
                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}>
                    {badge.label}
                </span>
            </div>
            <div className="w-24 min-w-0 text-xs text-muted-foreground">
                <div className="truncate" title={comment.ip_address}>
                    {comment.ip_location || comment.ip_address || "—"}
                </div>
            </div>
            <div className="w-20 shrink-0 text-xs text-muted-foreground xl:w-28">
                <div>{formatDate(comment.created_at)}</div>
                <div>{formatTime(comment.created_at)}</div>
            </div>
            <div className="ml-auto flex w-28 shrink-0 items-center justify-end gap-1 xl:ml-0">
                <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={busy}
                    aria-label={comment.status === 2 ? "通过审核" : "转为待审核"}
                    title={comment.status === 2 ? "通过审核" : "转为待审核"}
                    className={comment.status === 2 ? ACTION_TONE.approve : ACTION_TONE.neutral}
                    onClick={() => onToggleStatus(comment)}
                >
                    {comment.status === 2 ? <Check className="size-4" /> : <Clock className="size-4" />}
                </Button>
                <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={busy}
                    aria-label={pinned ? "取消置顶" : "置顶"}
                    title={pinned ? "取消置顶" : "置顶"}
                    className={pinned ? ACTION_TONE.pin : ACTION_TONE.neutral}
                    onClick={() => onTogglePin(comment)}
                >
                    <Pin className="size-4" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={busy}
                    aria-label="编辑"
                    title="编辑"
                    className={ACTION_TONE.edit}
                    onClick={() => onEdit(comment)}
                >
                    <Pencil className="size-4" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={busy}
                    aria-label="删除"
                    title="删除"
                    className={ACTION_TONE.delete}
                    onClick={() => onDelete(comment)}
                >
                    <Trash2 className="size-4" />
                </Button>
            </div>
        </div>
    );
}

/** 评论管理页：多条件筛选 + 分页列表 + 通过/待审、置顶、编辑、删除 */
export function CommentsManager() {
    const [list, setList] = useState<AdminComment[]>([]);
    const [total, setTotal] = useState(0);
    const [totalWithChildren, setTotalWithChildren] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [refreshKey, setRefreshKey] = useState(0);

    const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
    const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);

    const [selected, setSelected] = useState<string[]>([]);
    const [expanded, setExpanded] = useState<string[]>([]);
    const [busyId, setBusyId] = useState<string | null>(null);

    // 编辑弹窗
    const [editing, setEditing] = useState<AdminComment | null>(null);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({ content: "", nickname: "", email: "", website: "" });

    /** 当前页可见的评论 id（含已展开的子评论），用于全选 */
    const visibleIds = useMemo(() => {
        const ids: string[] = [];
        for (const comment of list) {
            ids.push(comment.id);
            if (expanded.includes(comment.id)) {
                for (const child of comment.children ?? []) ids.push(child.id);
            }
        }
        return ids;
    }, [list, expanded]);

    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id));
    const someSelected = selected.length > 0 && !allSelected;

    // 拉取评论列表（浏览器自动携带登录 cookie）
    useEffect(() => {
        let cancelled = false;
        const timer = setTimeout(() => setLoading(true), 0);
        getAdminCommentsApi({
            page,
            pageSize: PAGE_SIZE,
            nickname: applied.nickname.trim() || undefined,
            email: applied.email.trim() || undefined,
            content: applied.content.trim() || undefined,
            target_path: applied.target_path.trim() || undefined,
            status: applied.status === "all" ? undefined : (Number(applied.status) as CommentStatus),
        })
            .then((data) => {
                if (cancelled) return;
                setList(data.list ?? []);
                setTotal(data.total ?? 0);
                setTotalWithChildren(data.total_with_children ?? data.total ?? 0);
                setSelected([]);
                setExpanded([]);
            })
            .catch(() => {
                if (!cancelled) toast.error("评论列表加载失败");
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
    }, [page, applied, refreshKey]);

    const reload = () => setRefreshKey((k) => k + 1);

    const submitFilters = (e: React.FormEvent) => {
        e.preventDefault();
        setPage(1);
        setApplied(filters);
    };

    const resetFilters = () => {
        setFilters(EMPTY_FILTERS);
        setApplied(EMPTY_FILTERS);
        setPage(1);
    };

    const toggleSelect = (id: string) => {
        setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    };

    const toggleSelectAll = () => {
        setSelected(allSelected ? [] : visibleIds);
    };

    const toggleExpand = (id: string) => {
        setExpanded((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    };

    /** 单条评论操作统一包装：请求期间禁用该行按钮，失败弹提示 */
    const runAction = async (comment: AdminComment, action: () => Promise<unknown>, okText: string) => {
        setBusyId(comment.id);
        try {
            await action();
            toast.success(okText);
            reload();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "操作失败");
        } finally {
            setBusyId(null);
        }
    };

    const handleToggleStatus = (comment: AdminComment) => {
        const next: CommentStatus = comment.status === 2 ? 1 : 2;
        void runAction(comment, () => updateAdminCommentStatusApi(comment.id, next), next === 1 ? "已通过审核" : "已转为待审核");
    };

    const handleTogglePin = (comment: AdminComment) => {
        const pinned = !comment.pinned_at;
        void runAction(comment, () => toggleAdminCommentPinApi(comment.id, pinned), pinned ? "已置顶" : "已取消置顶");
    };

    const handleDelete = async (comment: AdminComment) => {
        const preview = oneLine(comment.content).slice(0, 40);
        if (!window.confirm(`确定删除这条评论吗？\n${preview}`)) return;
        setBusyId(comment.id);
        try {
            await deleteAdminCommentsApi([comment.id]);
            toast.success("删除成功");
            reload();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "删除失败");
        } finally {
            setBusyId(null);
        }
    };

    const handleBatchDelete = async () => {
        if (selected.length === 0) return;
        if (!window.confirm(`确定删除选中的 ${selected.length} 条评论吗？`)) return;
        try {
            await deleteAdminCommentsApi(selected);
            toast.success(`已删除 ${selected.length} 条评论`);
            setSelected([]);
            reload();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "批量删除失败");
        }
    };

    const openEdit = (comment: AdminComment) => {
        setEditing(comment);
        setForm({
            content: comment.content || "",
            nickname: comment.nickname || "",
            email: comment.email || "",
            website: comment.website || "",
        });
    };

    const handleSave = async () => {
        if (!editing) return;
        if (!form.content.trim()) {
            toast.error("评论内容不能为空");
            return;
        }
        setSaving(true);
        try {
            await updateAdminCommentInfoApi(editing.id, {
                content: form.content,
                nickname: form.nickname.trim() || undefined,
                email: form.email.trim() || undefined,
                website: form.website.trim(),
            });
            toast.success("保存成功");
            setEditing(null);
            reload();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "保存失败");
        } finally {
            setSaving(false);
        }
    };

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    return (
        <div className="mt-4 overflow-x-auto rounded-lg border bg-card shadow-sm">
            {/* ===== 筛选栏（移动端两列换行，桌面端单行 1000px） ===== */}
            <form
                onSubmit={submitFilters}
                className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-4 py-2.5 xl:min-w-[980px]"
            >
                <Input
                    value={filters.nickname}
                    onChange={(e) => setFilters({ ...filters, nickname: e.target.value })}
                    placeholder="昵称"
                    className="h-7 w-[calc(50%-0.25rem)] text-xs xl:w-28"
                />
                <Input
                    value={filters.email}
                    onChange={(e) => setFilters({ ...filters, email: e.target.value })}
                    placeholder="邮箱"
                    className="h-7 w-[calc(50%-0.25rem)] text-xs xl:w-40"
                />
                <Input
                    value={filters.content}
                    onChange={(e) => setFilters({ ...filters, content: e.target.value })}
                    placeholder="评论内容"
                    className="h-7 w-[calc(50%-0.25rem)] text-xs xl:w-40"
                />
                <Input
                    value={filters.target_path}
                    onChange={(e) => setFilters({ ...filters, target_path: e.target.value })}
                    placeholder="目标路径 /post/xxx"
                    className="h-7 w-[calc(50%-0.25rem)] text-xs xl:w-40"
                />
                <Select value={filters.status} onValueChange={(v) => setFilters({ ...filters, status: v })}>
                    <SelectTrigger className="h-7 w-max text-xs">
                        <SelectValue placeholder="全部状态" />
                    </SelectTrigger>
                    <SelectContent>
                        {STATUS_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                                {o.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Button type="submit" size="sm" className="h-7 px-2 text-xs">
                    <Search className="size-3.5" />
                    查询
                </Button>
                <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={resetFilters}>
                    <RotateCcw className="size-3.5" />
                    重置
                </Button>
                <span className="ml-1 text-xs text-muted-foreground">
                    共 <span className="font-medium text-foreground">{total}</span> 条评论
                    {totalWithChildren > total && <>（含回复 {totalWithChildren} 条）</>}
                </span>
                <div className="ml-auto flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                        disabled={selected.length === 0}
                        onClick={handleBatchDelete}
                    >
                        <Trash2 className="size-3.5" />
                        批量删除{selected.length > 0 ? `（${selected.length}）` : ""}
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={reload}>
                        <RefreshCw className="size-3.5" />
                        刷新
                    </Button>
                </div>
            </form>

            {/* ===== 表头（仅桌面端；移动端是卡片式布局，不需要表头） ===== */}
            <div className="hidden min-w-[980px] items-center gap-3 whitespace-nowrap border-b bg-muted/40 px-4 py-2.5 text-xs font-medium text-muted-foreground xl:flex">
                <Checkbox
                    checked={allSelected ? true : someSelected ? "indeterminate" : false}
                    onCheckedChange={toggleSelectAll}
                    aria-label="全选本页评论"
                />
                <span className="min-w-0 flex-1 max-w-[420px]">评论内容</span>
                <div className="ml-auto flex shrink-0 items-center gap-3">
                    <span className="w-36 shrink-0">评论者</span>
                    <span className="w-36 shrink-0">评论目标</span>
                    <span className="w-16 shrink-0 text-center">状态</span>
                    <span className="w-24 shrink-0">IP 归属地</span>
                    <span className="w-28 shrink-0">时间</span>
                    <span className="w-28 shrink-0 text-right">操作</span>
                </div>
            </div>

            {loading ? (
                <div className="py-12 text-center text-sm text-muted-foreground">加载中…</div>
            ) : list.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">暂无评论</div>
            ) : (
                <div className="xl:min-w-[980px]">
                    {list.map((comment) => (
                        <div key={comment.id}>
                            <CommentRow
                                comment={comment}
                                depth={0}
                                selected={selected.includes(comment.id)}
                                expanded={expanded.includes(comment.id)}
                                busyId={busyId}
                                onSelect={toggleSelect}
                                onToggleExpand={toggleExpand}
                                onToggleStatus={handleToggleStatus}
                                onTogglePin={handleTogglePin}
                                onEdit={openEdit}
                                onDelete={handleDelete}
                            />
                            {expanded.includes(comment.id) &&
                                (comment.children ?? []).map((child) => (
                                    <CommentRow
                                        key={child.id}
                                        comment={child}
                                        depth={1}
                                        selected={selected.includes(child.id)}
                                        expanded={false}
                                        busyId={busyId}
                                        onSelect={toggleSelect}
                                        onToggleExpand={toggleExpand}
                                        onToggleStatus={handleToggleStatus}
                                        onTogglePin={handleTogglePin}
                                        onEdit={openEdit}
                                        onDelete={handleDelete}
                                    />
                                ))}
                        </div>
                    ))}
                </div>
            )}

            {/* ===== 分页 ===== */}
            <div className="flex items-center justify-between gap-3 border-t bg-muted/40 px-4 py-2.5 text-xs text-muted-foreground">
                <span>
                    第 {page} / {totalPages} 页
                </span>
                <PaginationControls
                    page={page}
                    totalPages={totalPages}
                    onPageChange={setPage}
                />
            </div>

            {/* ===== 编辑评论弹窗 ===== */}
            {editing && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
                    onMouseDown={() => setEditing(null)}
                >
                    <div
                        className="w-full max-w-xl rounded-xl border bg-card p-5 shadow-xl"
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        <div className="mb-4 flex items-center justify-between">
                            <h3 className="text-base font-semibold">编辑评论 #{editing.id}</h3>
                            <button
                                type="button"
                                onClick={() => setEditing(null)}
                                aria-label="关闭"
                                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="space-y-3">
                            <label className="block">
                                <span className="mb-1 block text-xs font-medium text-muted-foreground">
                                    评论内容（Markdown，必填，最多 1000 字）
                                </span>
                                <textarea
                                    value={form.content}
                                    onChange={(e) => setForm({ ...form, content: e.target.value })}
                                    rows={5}
                                    maxLength={1000}
                                    className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                                />
                                <span className="mt-1 block text-right text-xs text-muted-foreground">
                                    {form.content.length} / 1000
                                </span>
                            </label>
                            <div className="grid grid-cols-3 gap-3">
                                <label className="block">
                                    <span className="mb-1 block text-xs font-medium text-muted-foreground">昵称</span>
                                    <Input
                                        value={form.nickname}
                                        onChange={(e) => setForm({ ...form, nickname: e.target.value })}
                                        maxLength={50}
                                    />
                                </label>
                                <label className="block">
                                    <span className="mb-1 block text-xs font-medium text-muted-foreground">邮箱</span>
                                    <Input
                                        value={form.email}
                                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                                        placeholder="—"
                                    />
                                </label>
                                <label className="block">
                                    <span className="mb-1 block text-xs font-medium text-muted-foreground">网站</span>
                                    <Input
                                        value={form.website}
                                        onChange={(e) => setForm({ ...form, website: e.target.value })}
                                        placeholder="https://…"
                                    />
                                </label>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                评论目标：{editing.target_title || editing.target_path}
                            </p>
                            <div className="flex justify-end gap-2 pt-2">
                                <Button variant="outline" onClick={() => setEditing(null)}>
                                    取消
                                </Button>
                                <Button onClick={handleSave} disabled={saving}>
                                    {saving ? "保存中…" : "保存"}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
