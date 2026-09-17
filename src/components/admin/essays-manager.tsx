"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Eye, Image as ImageIcon, Music, Pencil, Plus, RefreshCw, Trash2, Video as VideoIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    createAdminEssayApi,
    deleteAdminEssayApi,
    getAdminEssaysListApi,
    updateAdminEssayApi,
} from "@/lib/api";
import type { Essay } from "@/types/essays";

const PAGE_SIZE = 10;

const STATUS_OPTIONS = [
    { value: "1", label: "发布" },
    { value: "2", label: "草稿" },
    { value: "3", label: "隐藏" },
];

/** 状态徽章（1=发布 2=草稿 3=隐藏） */
function statusBadge(status?: number) {
    if (status === 1) return { label: "发布", cls: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400" };
    if (status === 2) return { label: "草稿", cls: "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-400" };
    if (status === 3) return { label: "隐藏", cls: "bg-muted text-muted-foreground" };
    return { label: String(status ?? ""), cls: "bg-muted text-muted-foreground" };
}

/** 非空判定：字符串需非空；数组需有元素；对象需「任一值非空」才算有效。
 *  后端对未加媒体的说说仍会返回类似 aplayer:{id:""} 的空配置对象，不能仅按「有键」判断，
 *  否则空 id 会被误判成有音乐。值全部为空（如 {id:""}）视为「无」。 */
function nonEmpty(value?: unknown): boolean {
    if (typeof value === "string") return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value !== "object" || value === null) return false;
    return Object.values(value as Record<string, unknown>).some(nonEmpty);
}

/** 媒体列展示：图片→「N 张图片」；aplayer（非空）→「音乐」；video（非空）→「视频」；否则为空 */
function mediaMeta(essay: Essay): { icon: React.ReactNode; text: string } | null {
    const imgCount = essay.image?.length || 0;
    if (imgCount > 0) return { icon: <ImageIcon className="size-3.5" />, text: `${imgCount} 张` };
    if (nonEmpty(essay.aplayer)) return { icon: <Music className="size-3.5" />, text: "音乐" };
    if (nonEmpty(essay.video)) return { icon: <VideoIcon className="size-3.5" />, text: "视频" };
    return null;
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

/** 说说管理页：状态筛选 + 列表 + 编辑弹窗 + 删除 */
export function EssaysManager() {
    const [list, setList] = useState<Essay[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [statusFilter, setStatusFilter] = useState(""); // "" 全部
    const [loading, setLoading] = useState(true);
    const [refreshKey, setRefreshKey] = useState(0);

    // ===== 编辑弹窗状态 =====
    const [preview, setPreview] = useState<Essay | null>(null);
    const [editing, setEditing] = useState<Essay | null>(null);
    const [createOpen, setCreateOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({
        content: "",
        image: "",
        address: "",
        from: "",
        link: "",
        sort_order: "",
        status: "",
    });

    const openEdit = (essay: Essay) => {
        setEditing(essay);
        setForm({
            content: essay.content || "",
            image: (essay.image || []).join("\n"),
            address: essay.address || "",
            from: essay.from || "",
            link: essay.link || "",
            sort_order: essay.sort_order ? String(essay.sort_order) : "",
            status: essay.status ? String(essay.status) : "1",
        });
    };

    const closeDialog = () => {
        setEditing(null);
        setCreateOpen(false);
    };

    /** 打开新增弹窗（空表单） */
    const openCreate = () => {
        setEditing(null);
        setForm({
            content: "",
            image: "",
            address: "",
            from: "",
            link: "",
            sort_order: "",
            status: "1",
        });
        setCreateOpen(true);
    };

    const handleSave = async () => {
        if (createOpen && !editing) {
            // —— 新增 ——
            if (!form.content.trim()) {
                toast.error("正文内容必填");
                return;
            }
            setSaving(true);
            try {
                await createAdminEssayApi({
                    content: form.content,
                    image: form.image
                        .split(/\r?\n/)
                        .map((s) => s.trim())
                        .filter(Boolean),
                    address: form.address || undefined,
                    from: form.from || undefined,
                    link: form.link || undefined,
                    sort_order: form.sort_order ? Number(form.sort_order) : undefined,
                    status: form.status ? Number(form.status) : undefined,
                });
                toast.success("新增成功");
                setCreateOpen(false);
                setRefreshKey((k) => k + 1);
            } catch (e) {
                toast.error(e instanceof Error ? e.message : "新增失败");
            } finally {
                setSaving(false);
            }
            return;
        }
        // —— 编辑 ——
        if (!editing) return;
        if (!form.content.trim()) {
            toast.error("正文内容必填");
            return;
        }
        setSaving(true);
        try {
            await updateAdminEssayApi(editing.id, {
                content: form.content,
                image: form.image
                    .split(/\r?\n/)
                    .map((s) => s.trim())
                    .filter(Boolean),
                address: form.address || undefined,
                from: form.from || undefined,
                link: form.link || undefined,
                sort_order: form.sort_order ? Number(form.sort_order) : undefined,
                status: form.status ? Number(form.status) : undefined,
            });
            toast.success("保存成功");
            setEditing(null);
            setRefreshKey((k) => k + 1);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "保存失败");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (essay: Essay) => {
        if (!window.confirm(`确定删除这条说说吗？\n${essay.content?.slice(0, 40) || ""}`)) return;
        try {
            await deleteAdminEssayApi(essay.id);
            toast.success("删除成功");
            setRefreshKey((k) => k + 1);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "删除失败");
        }
    };

    // 状态筛选变化时回到第一页
    useEffect(() => {
        const timer = setTimeout(() => setPage(1), 0);
        return () => clearTimeout(timer);
    }, [statusFilter]);

    // 拉取说说列表（浏览器自动携带登录 cookie）
    useEffect(() => {
        let cancelled = false;
        const timer = setTimeout(() => setLoading(true), 0);
        getAdminEssaysListApi({
            page,
            page_size: PAGE_SIZE,
            status: statusFilter ? Number(statusFilter) : undefined,
        })
            .then((data) => {
                // 临时调试：查看后台说说列表接口返回结构
                console.log("[essays-admin] 说说列表返回:", data);
                if (cancelled) return;
                setList(data.list ?? []);
                setTotal(data.total ?? 0);
            })
            .catch(() => {
                if (!cancelled) toast.error("说说列表加载失败");
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

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    return (
        <div className="mt-4 overflow-x-auto rounded-lg border bg-card shadow-sm">
            <div className="flex min-w-[720px] flex-wrap items-center justify-between gap-3 border-b bg-slate-50 px-4 py-2.5">
                <div className="flex items-center gap-3">
                    {/* 状态筛选 */}
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        状态
                        <Select
                            value={statusFilter}
                            onValueChange={(v) => setStatusFilter(v)}
                        >
                            <SelectTrigger className="h-7 w-max text-xs">
                                <SelectValue placeholder="全部" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="">全部</SelectItem>
                                {STATUS_OPTIONS.map((o) => (
                                    <SelectItem key={o.value} value={o.value}>
                                        {o.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <span className="text-xs text-muted-foreground">
                        共 <span className="font-medium text-foreground">{total}</span> 条说说
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        size="sm"
                        className="h-7 px-2 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
                        onClick={openCreate}
                    >
                        <Plus className="size-3.5" />
                        新增说说
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

            {/* 表头 */}
            <div className="flex items-center gap-3 whitespace-nowrap border-b bg-slate-50 px-4 py-2.5 text-xs font-medium text-muted-foreground">
                <span className="min-w-0 flex-1 max-w-[420px]">内容</span>
                <div className="ml-auto flex shrink-0 items-center gap-3">
                    <span className="w-24 shrink-0">媒体</span>
                    <span className="w-16 shrink-0 text-center">状态</span>
                    <span className="w-28 shrink-0">信息</span>
                    <span className="w-32 shrink-0">时间</span>
                    <span className="w-20 shrink-0 text-right">操作</span>
                </div>
            </div>

            {loading ? (
                <div className="py-12 text-center text-sm text-muted-foreground">加载中…</div>
            ) : list.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">暂无说说</div>
            ) : (
                list.map((essay) => {
                    const badge = statusBadge(essay.status);
                    const media = mediaMeta(essay);
                    return (
                        <div
                            key={essay.id}
                            className="flex items-center gap-3 whitespace-nowrap border-b px-4 py-3 text-sm last:border-b-0 hover:bg-muted/40"
                        >
                            <div className="min-w-0 flex-1 max-w-[420px]">
                                <div className="line-clamp-1 whitespace-pre-line break-words text-foreground">
                                    {essay.content || "—"}
                                </div>
                            </div>
                            {/* 右列组：媒体/状态/信息/时间/操作，整体靠右贴着操作列 */}
                            <div className="ml-auto flex shrink-0 items-center gap-3">
                                {/* 媒体列：图片/音乐/视频 */}
                                <div className="w-24 shrink-0 text-xs text-muted-foreground">
                                    {media && (
                                        <span className="inline-flex items-center gap-1">
                                            {media.icon}
                                            {media.text}
                                        </span>
                                    )}
                                </div>
                                <div className="w-16 shrink-0 text-center">
                                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}>
                                        {badge.label}
                                    </span>
                                </div>
                                <div className="w-28 shrink-0 text-xs text-muted-foreground">
                                    <div className="truncate font-medium">{essay.address || "—"}</div>
                                    <div className="truncate text-muted-foreground/60">{essay.from || "—"}</div>
                                </div>
                                <div className="w-32 shrink-0 text-xs text-muted-foreground">
                                    <div>{formatDate(essay.created_at)}</div>
                                    <div>{formatTime(essay.created_at)}</div>
                                </div>
                                <div className="flex w-20 shrink-0 items-center justify-end gap-1">
                                <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label="编辑"
                                    title="编辑"
                                    onClick={() => openEdit(essay)}
                                >
                                    <Pencil className="size-4" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label="预览"
                                    title="预览"
                                    onClick={() => setPreview(essay)}
                                >
                                    <Eye className="size-4" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label="删除"
                                    title="删除"
                                    className="text-destructive hover:text-destructive"
                                    onClick={() => handleDelete(essay)}
                                >
                                    <Trash2 className="size-4" />
                                </Button>
                                </div>
                            </div>
                        </div>
                    );
                })
            )}

            {/* 分页：上一页 / 下一页 */}
            <div className="flex items-center justify-between gap-3 border-t bg-slate-50 px-4 py-2.5 text-xs text-muted-foreground">
                <span>第 {page} / {totalPages} 页</span>
                <div className="flex items-center gap-1">
                    <Button
                        variant="outline"
                        size="icon-sm"
                        disabled={page <= 1}
                        onClick={() => setPage((p) => p - 1)}
                        aria-label="上一页"
                    >
                        <ChevronLeft className="size-4" />
                    </Button>
                    <Button
                        variant="outline"
                        size="icon-sm"
                        disabled={page >= totalPages}
                        onClick={() => setPage((p) => p + 1)}
                        aria-label="下一页"
                    >
                        <ChevronRight className="size-4" />
                    </Button>
                </div>
            </div>

            {/* ===== 编辑 / 新增说说弹窗 ===== */}
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
                                {createOpen ? "新增说说" : `编辑说说 #${editing?.id}`}
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
                            <label className="block">
                                <span className="mb-1 block text-xs font-medium text-muted-foreground">正文（必填）</span>
                                <textarea
                                    value={form.content}
                                    onChange={(e) => setForm({ ...form, content: e.target.value })}
                                    rows={4}
                                    placeholder="此时此刻的想法…"
                                    className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                                />
                            </label>
                            <label className="block">
                                <span className="mb-1 block text-xs font-medium text-muted-foreground">图片地址（可选，每行一个）</span>
                                <textarea
                                    value={form.image}
                                    onChange={(e) => setForm({ ...form, image: e.target.value })}
                                    rows={3}
                                    placeholder="https://…"
                                    className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                                />
                            </label>
                            <div className="grid grid-cols-2 gap-3">
                                <label className="block">
                                    <span className="mb-1 block text-xs font-medium text-muted-foreground">定位地址</span>
                                    <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="如：家里" />
                                </label>
                                <label className="block">
                                    <span className="mb-1 block text-xs font-medium text-muted-foreground">来源</span>
                                    <Input value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} placeholder="如：微博" />
                                </label>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <label className="block">
                                    <span className="mb-1 block text-xs font-medium text-muted-foreground">关联链接</span>
                                    <Input value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} placeholder="https://…" />
                                </label>
                                <label className="block">
                                    <span className="mb-1 block text-xs font-medium text-muted-foreground">排序权重</span>
                                    <Input
                                        type="number"
                                        value={form.sort_order}
                                        onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
                                        placeholder="0"
                                    />
                                </label>
                            </div>
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
                            <div className="flex justify-end gap-2 pt-2">
                                <Button variant="outline" onClick={closeDialog}>
                                    取消
                                </Button>
                                <Button onClick={handleSave} disabled={saving}>
                                    {saving ? (createOpen ? "新增中…" : "保存中…") : createOpen ? "新增" : "保存"}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ===== 预览说说弹窗（只读） ===== */}
            {preview && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
                    onMouseDown={() => setPreview(null)}
                >
                    <div
                        className="w-full max-w-xl rounded-xl border bg-card p-5 shadow-xl"
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        <div className="mb-4 flex items-center justify-between">
                            <h3 className="text-base font-semibold">预览说说 #{preview.id}</h3>
                            <button
                                type="button"
                                onClick={() => setPreview(null)}
                                aria-label="关闭"
                                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="space-y-3">
                            <div className="whitespace-pre-line text-sm leading-relaxed">
                                {preview.content || "—"}
                            </div>
                            {(preview.image && preview.image.length > 0) && (
                                <div className="grid grid-cols-2 gap-2">
                                    {preview.image.map((url) => (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            key={url}
                                            src={url}
                                            alt="说说配图"
                                            className="max-h-48 w-full rounded-lg border object-cover"
                                        />
                                    ))}
                                </div>
                            )}
                            <div className="flex flex-wrap gap-x-4 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
                                <span>{preview.address ? `地址：${preview.address}` : ""}</span>
                                <span>{preview.from ? `来源：${preview.from}` : ""}</span>
                                <span>发布于 {formatDate(preview.created_at)} {formatTime(preview.created_at)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
