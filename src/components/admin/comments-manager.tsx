"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
    Archive,
    ArchiveRestore,
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
    Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/confirm-provider";
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
import {
    MAX_COMMENT_IMPORT_SIZE,
    exportAdminCommentsApi,
    formatBytes,
    importAdminCommentsApi,
    isSupportedCommentImportFile,
    type CommentImportOptions,
    type CommentImportResult,
} from "@/lib/api-comments-io";
import type { AdminComment, CommentStatus } from "@/types/comments";

const PAGE_SIZE = 10;

const STATUS_OPTIONS = [
    { value: "all", label: "全部状态" },
    { value: "1", label: "已发布" },
    { value: "2", label: "待审核" },
];

/* =============================================================================
 * 评论导出 / 导入（同源代理 → 远端，管理员登录）
 *
 * 接口契约（源码证据）：
 *  - POST /comments/export（internal/infra/router/router.go:287）请求体 { ids: string[] }
 *    （pkg/handler/comment/dto/dto.go:140-143），空数组 = 导出全部（handler.go:619-622）；
 *    响应是 **ZIP 文件流**（application/zip + Content-Disposition: attachment;
 *    filename=comments_export.zip，handler.go:633-638），不是 JSON 信封。
 *  - POST /comments/import（router.go:288）multipart/form-data，字段 file 必填，
 *    可选 skip_existing / default_status / keep_create_time（handler.go:657-693）；
 *    .json 直接解析、.zip 取包内 comments.json（handler.go:706-718）；
 *    响应 { code, message, data: ImportResult }（handler.go:727-736）。
 *
 * ⚠️ 导入是**写库**操作：无论是否识别成功，都必须先过二次确认（确认文案里写明后果），
 *    且全程只走同源代理，浏览器端不直连远端。
 * ========================================================================== */

/** 导入结果里最多列出多少条失败原因（后端 error_messages 可能很长） */
const MAX_SHOWN_IMPORT_ERRORS = 8;

/** 字节数 → 人类可读（沿用 formatBytes，导入框里展示选中文件大小） */
const MAX_IMPORT_SIZE_TEXT = formatBytes(MAX_COMMENT_IMPORT_SIZE);

/** 用浏览器下载一个 blob（导出评论用） */
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

    // 导出 / 导入
    const [exporting, setExporting] = useState(false);
    const [importOpen, setImportOpen] = useState(false);
    const [importFile, setImportFile] = useState<File | null>(null);
    /** 后台导入完成后结果是只读的，单独存一份避免每次重渲染都擦掉 */
    const [importResult, setImportResult] = useState<CommentImportResult | null>(null);
    const [importing, setImporting] = useState(false);
    const [importOptions, setImportOptions] = useState<CommentImportOptions>({
        // 与后端 DefaultPostForm 的默认值保持一致（handler.go:687-688），只是现在我们显式传
        skipExisting: true,
        keepCreateTime: true,
        defaultStatus: 1,
    });
    const importInputRef = useRef<HTMLInputElement | null>(null);

    // 应用内确认弹窗（替代 window.confirm，见 components/confirm-provider.tsx）
    const confirm = useConfirm();

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
        if (!(await confirm({ title: "确定删除这条评论吗？", description: preview, danger: true }))) return;
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
        if (!(await confirm({ title: `确定删除选中的 ${selected.length} 条评论吗？`, danger: true }))) return;
        try {
            await deleteAdminCommentsApi(selected);
            toast.success(`已删除 ${selected.length} 条评论`);
            setSelected([]);
            reload();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "批量删除失败");
        }
    };

    /**
     * 导出评论：勾选了就只导出勾选的那几条，没勾选就导出全部。
     * 远端回的是 ZIP 文件流（带 Content-Disposition），这里直接落盘；
     * 条数按本地口径提示，不去猜远端实际打包了多少条。
     */
    const handleExport = async () => {
        const ids = selected;
        setExporting(true);
        try {
            const { blob, filename } = await exportAdminCommentsApi(ids);
            const fallback = `comments_export_${new Date().toISOString().slice(0, 10)}.zip`;
            downloadBlob(blob, filename || fallback);
            toast.success(ids.length > 0 ? `已导出选中的 ${ids.length} 条评论` : "已开始导出全部评论", {
                description: "ZIP 内含 comments.json，可直接在「导入」里回灌",
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
        if (!isSupportedCommentImportFile(file.name)) {
            toast.error("只支持 .json 或 .zip 文件");
            resetImport();
            return;
        }
        if (file.size > MAX_COMMENT_IMPORT_SIZE) {
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
            const res = await importAdminCommentsApi(importFile, importOptions);
            setImportResult(res);
            if (res.success_count > 0) {
                toast.success(`导入完成：成功 ${res.success_count} 条`);
                reload();
            } else if (res.failed_count > 0) {
                toast.warning("没有成功导入任何评论，看看下方失败原因");
            } else {
                toast.info("没有新增评论（可能都被跳过了）");
            }
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "导入失败");
        } finally {
            setImporting(false);
        }
    };

    /** 二次确认：导入会往评论表写数据，文案里写清后果 */
    const confirmImport = async () => {
        if (!importFile) return;
        const ok = await confirm({
            title: "确定导入吗？",
            description:
                `文件：${importFile.name}\n\n` +
                `这会向评论表写入数据（不可撤销）。\n` +
                `已存在的评论：${importOptions.skipExisting ? "跳过（按 路径+邮箱+内容 判重）" : "不判重，可能产生重复"}\n` +
                `创建时间：${importOptions.keepCreateTime ? "保留原时间" : "使用当前时间"}\n` +
                `默认状态：${importOptions.defaultStatus === 1 ? "已发布" : "待审核"}`,
        });
        if (!ok) return;
        void handleImport();
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
        // admin-card：吃掉剩余高度，表格区域（admin-scroll）在卡片内部滚动
        <div className="admin-card">
            {/* ===== 筛选栏（移动端两列换行，桌面端单行；固定在卡片顶部，不随表格滚动） ===== */}
            <form
                onSubmit={submitFilters}
                className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-muted/40 px-4 py-2.5"
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
                        className="h-7 px-2 text-xs"
                        disabled={exporting}
                        title={
                            selected.length > 0
                                ? `导出勾选的 ${selected.length} 条评论`
                                : "未勾选任何评论时导出全部评论"
                        }
                        onClick={() => void handleExport()}
                    >
                        <Archive className="size-3.5" />
                        {exporting
                            ? "导出中…"
                            : selected.length > 0
                              ? `导出（${selected.length}）`
                              : "导出"}
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        title="从 .json / .zip 文件导入评论"
                        onClick={() => setImportOpen(true)}
                    >
                        <ArchiveRestore className="size-3.5" />
                        导入
                    </Button>
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

            {/* 列表滚动区：只有这块纵向 / 横向滚动（表头吸顶），筛选栏与分页都固定在卡片上 */}
            <div className="admin-scroll">
                {/* ===== 表头（仅桌面端；移动端是卡片式布局，不需要表头） ===== */}
                <div className="admin-sticky-head hidden min-w-[980px] items-center gap-3 whitespace-nowrap border-b px-4 py-2.5 text-xs font-medium text-muted-foreground xl:flex">
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
            </div>

            {/* ===== 分页：固定在卡片底部，不随表格滚动 ===== */}
            <div className="flex shrink-0 items-center justify-between gap-3 border-t bg-muted/40 px-4 py-2.5 text-xs text-muted-foreground">
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

            {/* ===== 导入评论弹窗（⚠️ 写库，需二次确认） ===== */}
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
                        className="w-full max-w-xl rounded-xl border bg-card p-5 shadow-xl"
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        <div className="mb-4 flex items-center justify-between">
                            <h3 className="text-base font-semibold">导入评论</h3>
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

                        <div className="space-y-4 text-sm">
                            <p className="text-xs text-muted-foreground">
                                支持 <code>.json</code>（导出的 comments.json）或 <code>.zip</code>
                                （「导出」下载的整包）。单文件不超过 {MAX_IMPORT_SIZE_TEXT}。导入会写入评论表，请先确认文件内容。
                            </p>

                            {/* 文件选择 */}
                            <div className="flex flex-wrap items-center gap-2">
                                <input
                                    ref={importInputRef}
                                    type="file"
                                    accept=".json,.zip,application/json,application/zip"
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

                            {/* 导入选项（字段名与后端 handler.go:687-693 一致） */}
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
                                    <span>
                                        跳过已存在的评论
                                        <span className="ml-1 text-muted-foreground">
                                            （按 目标路径 + 邮箱 + 内容 判重）
                                        </span>
                                    </span>
                                </label>
                                <label className="flex cursor-pointer items-start gap-2 text-xs">
                                    <Checkbox
                                        className="mt-0.5"
                                        checked={importOptions.keepCreateTime}
                                        disabled={importing}
                                        onCheckedChange={(v) =>
                                            setImportOptions({ ...importOptions, keepCreateTime: v === true })
                                        }
                                    />
                                    <span>
                                        保留原创建时间
                                        <span className="ml-1 text-muted-foreground">（取消则用当前时间）</span>
                                    </span>
                                </label>
                                <div className="flex items-center gap-2 text-xs">
                                    <span>未带状态的评论导入为</span>
                                    <Select
                                        value={String(importOptions.defaultStatus)}
                                        disabled={importing}
                                        onValueChange={(v) =>
                                            setImportOptions({
                                                ...importOptions,
                                                defaultStatus: Number(v) === 2 ? 2 : 1,
                                            })
                                        }
                                    >
                                        <SelectTrigger className="h-7 w-max text-xs">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="1">已发布</SelectItem>
                                            <SelectItem value="2">待审核</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            {/* 导入结果（后端 dto.ImportResult） */}
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
                                    {(importResult.error_messages?.length ?? 0) > 0 && (
                                        <ul className="max-h-32 space-y-1 overflow-y-auto text-muted-foreground">
                                            {importResult.error_messages
                                                ?.slice(0, MAX_SHOWN_IMPORT_ERRORS)
                                                .map((msg, i) => (
                                                    <li key={`${i}-${msg}`}>
                                                        <span className="text-destructive">失败</span> {msg}
                                                    </li>
                                                ))}
                                            {(importResult.error_messages?.length ?? 0) >
                                                MAX_SHOWN_IMPORT_ERRORS && (
                                                <li>
                                                    …还有{" "}
                                                    {(importResult.error_messages?.length ?? 0) -
                                                        MAX_SHOWN_IMPORT_ERRORS}{" "}
                                                    条
                                                </li>
                                            )}
                                        </ul>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="mt-5 flex justify-end gap-2">
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
