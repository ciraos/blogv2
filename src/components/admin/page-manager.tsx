"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, FileText, Loader2, Pencil, Plus, RefreshCw, Search, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { PaginationControls } from "@/components/pagination-controls";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    createAdminPageApi,
    deleteAdminPageApi,
    getAdminPagesApi,
    initializeAdminPagesApi,
    updateAdminPageApi,
} from "@/lib/api";
import type { AdminPage, AdminPagePayload } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ACTION_TONE } from "@/lib/action-tones";

const PAGE_SIZE = 10;

type PublishFilter = "all" | "published" | "draft";

/** ISO → YYYY-MM-DD HH:MM */
function formatTime(iso?: string): string {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * 页面管理（对齐官方后台）：留言板 / cookies / 隐私协议 / 版权协议这类自定义页面。
 * 列表来自远端 GET /pages（经同源代理 /api/admin/pages，需管理员），支持搜索、发布状态筛选、分页；
 * 可新建 / 编辑 / 删除页面，也可一键初始化默认页面。
 * 说明：前台渲染的是 `content`（HTML），所以内容以 HTML 为准，Markdown 原文作为可选字段保留。
 */
export function PageManager() {
    const [pages, setPages] = useState<AdminPage[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchInput, setSearchInput] = useState("");
    const [search, setSearch] = useState("");
    const [publishFilter, setPublishFilter] = useState<PublishFilter>("all");
    const [editing, setEditing] = useState<AdminPage | "new" | null>(null);
    const [busy, setBusy] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await getAdminPagesApi({
                page,
                page_size: PAGE_SIZE,
                search: search || undefined,
                is_published: publishFilter === "all" ? undefined : publishFilter === "published",
            });
            setPages(data.pages ?? []);
            setTotal(data.total ?? 0);
        } catch (e) {
            setError(e instanceof Error ? e.message : "页面列表加载失败");
            setPages([]);
        } finally {
            setLoading(false);
        }
    }, [page, search, publishFilter]);

    useEffect(() => {
        // 延后到下一个 tick：effect 内同步 setState 会触发级联渲染（react-hooks/set-state-in-effect）
        const timer = setTimeout(() => void load(), 0);
        return () => clearTimeout(timer);
    }, [load, refreshKey]);

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const reload = () => setRefreshKey((k) => k + 1);

    const submitSearch = () => {
        setPage(1);
        setSearch(searchInput.trim());
    };

    const handleDelete = async (item: AdminPage) => {
        if (!window.confirm(`确定删除页面「${item.title}」（${item.path}）吗？`)) return;
        setBusy(true);
        try {
            await deleteAdminPageApi(item.id);
            toast.success("页面已删除");
            reload();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "删除失败");
        } finally {
            setBusy(false);
        }
    };

    const handleInitialize = async () => {
        if (!window.confirm("初始化默认页面？会补齐 /privacy、/cookies、/copyright 等（已存在的不会被覆盖）。")) return;
        setBusy(true);
        try {
            await initializeAdminPagesApi();
            toast.success("默认页面已初始化");
            reload();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "初始化失败");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-3">
            {/* ===== 工具栏 ===== */}
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") submitSearch();
                            }}
                            placeholder="搜索标题 / 路径…"
                            className="h-9 w-48 pl-8 text-xs sm:w-64"
                        />
                    </div>
                    <Button variant="outline" size="sm" className="h-9 rounded-xl text-xs" onClick={submitSearch}>
                        查询
                    </Button>
                    <Select
                        value={publishFilter}
                        onValueChange={(v) => {
                            setPublishFilter(v as PublishFilter);
                            setPage(1);
                        }}
                    >
                        <SelectTrigger className="h-9 w-32 rounded-xl text-xs">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">全部状态</SelectItem>
                            <SelectItem value="published">已发布</SelectItem>
                            <SelectItem value="draft">未发布</SelectItem>
                        </SelectContent>
                    </Select>
                    <Button
                        variant="outline"
                        size="icon-sm"
                        aria-label="刷新"
                        title="刷新"
                        className="size-9 rounded-xl"
                        disabled={loading}
                        onClick={() => void load()}
                    >
                        <RefreshCw className={cn("size-4", loading && "animate-spin")} />
                    </Button>
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-9 rounded-xl text-xs"
                        disabled={busy}
                        onClick={() => void handleInitialize()}
                    >
                        <Sparkles className="size-3.5" />
                        初始化默认页面
                    </Button>
                    <Button size="sm" className="h-9 rounded-xl text-xs" disabled={busy} onClick={() => setEditing("new")}>
                        <Plus className="size-3.5" />
                        新建页面
                    </Button>
                </div>
            </div>

            {/* ===== 列表 ===== */}
            {loading ? (
                <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground">
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    加载中…
                </div>
            ) : error ? (
                <div className="flex min-h-64 flex-col items-center justify-center gap-2 text-sm">
                    <p className="text-destructive">{error}</p>
                    <Button variant="outline" size="sm" onClick={() => void load()}>
                        重试
                    </Button>
                </div>
            ) : pages.length === 0 ? (
                <div className="flex min-h-64 flex-col items-center justify-center gap-1 text-sm text-muted-foreground">
                    <FileText className="size-8 opacity-40" />
                    {search || publishFilter !== "all" ? "没有匹配的页面" : "还没有自定义页面"}
                </div>
            ) : (
                <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
                    <div className="hidden min-w-[820px] grid-cols-[1fr_180px_90px_70px_60px_150px_150px] items-center gap-3 border-b bg-muted/40 px-4 py-2.5 text-xs font-medium text-muted-foreground sm:grid">
                        <span>标题</span>
                        <span>路径</span>
                        <span>状态</span>
                        <span className="text-center">评论</span>
                        <span className="text-center">排序</span>
                        <span>更新时间</span>
                        <span className="text-right">操作</span>
                    </div>
                    <div className="sm:min-w-[820px]">
                        {pages.map((item) => (
                            <div
                                key={item.id}
                                className="grid grid-cols-1 items-center gap-x-3 gap-y-1 border-b px-4 py-3 text-sm transition-colors last:border-b-0 hover:bg-muted/40 sm:grid-cols-[1fr_180px_90px_70px_60px_150px_150px]"
                            >
                                <div className="min-w-0">
                                    <div className="truncate font-medium" title={item.title}>
                                        {item.title}
                                    </div>
                                    {item.description && (
                                        <div className="truncate text-xs text-muted-foreground" title={item.description}>
                                            {item.description}
                                        </div>
                                    )}
                                </div>
                                <span className="truncate font-mono text-xs text-muted-foreground" title={item.path}>
                                    {item.path}
                                </span>
                                <span>
                                    <Badge
                                        variant="outline"
                                        className={cn(
                                            "text-[10px] font-medium",
                                            item.is_published
                                                ? "border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400"
                                                : "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                                        )}
                                    >
                                        {item.is_published ? "已发布" : "未发布"}
                                    </Badge>
                                </span>
                                <span className="text-center text-xs text-muted-foreground">
                                    {item.show_comment ? "开" : "关"}
                                </span>
                                <span className="text-center text-xs tabular-nums text-muted-foreground">{item.sort}</span>
                                <span className="text-xs text-muted-foreground">{formatTime(item.updated_at)}</span>
                                <span className="flex justify-end gap-1">
                                    <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        aria-label="打开页面"
                                        title="打开前台页面"
                                        className={ACTION_TONE.view}
                                        onClick={() => window.open(item.path, "_blank", "noopener")}
                                    >
                                        <ExternalLink className="size-3.5" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        aria-label="编辑"
                                        title="编辑"
                                        className={ACTION_TONE.edit}
                                        onClick={() => setEditing(item)}
                                    >
                                        <Pencil className="size-3.5" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        aria-label="删除"
                                        title="删除"
                                        className={ACTION_TONE.delete}
                                        disabled={busy}
                                        onClick={() => void handleDelete(item)}
                                    >
                                        <Trash2 className="size-3.5" />
                                    </Button>
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ===== 分页 ===== */}
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                <span>
                    共 <span className="font-medium text-foreground">{total}</span> 个页面 · 第 {page} / {totalPages} 页
                </span>
                <PaginationControls
                    page={page}
                    totalPages={totalPages}
                    disabled={loading}
                    onPageChange={setPage}
                />
            </div>

            {/* ===== 新建 / 编辑 ===== */}
            {editing && (
                <PageEditorDialog
                    page={editing === "new" ? null : editing}
                    busy={busy}
                    setBusy={setBusy}
                    onClose={() => setEditing(null)}
                    onSaved={() => {
                        setEditing(null);
                        reload();
                    }}
                />
            )}
        </div>
    );
}

/** 新建 / 编辑页面弹窗 */
function PageEditorDialog({
    page,
    busy,
    setBusy,
    onClose,
    onSaved,
}: {
    page: AdminPage | null;
    busy: boolean;
    setBusy: (v: boolean) => void;
    onClose: () => void;
    onSaved: () => void;
}) {
    const isNew = !page;
    const [form, setForm] = useState({
        title: page?.title ?? "",
        path: page?.path ?? "",
        description: page?.description ?? "",
        content: page?.content ?? "",
        markdown_content: page?.markdown_content ?? "",
        custom_css: page?.custom_css ?? "",
        custom_js: page?.custom_js ?? "",
        is_published: page?.is_published ?? true,
        show_comment: page?.show_comment ?? false,
        sort: page?.sort ?? 0,
    });

    const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
        setForm((prev) => ({ ...prev, [key]: value }));

    const save = async () => {
        if (!form.title.trim() || !form.path.trim() || !form.content.trim()) {
            toast.error("标题、路径、内容（HTML）都是必填");
            return;
        }
        const payload: AdminPagePayload = {
            title: form.title.trim(),
            path: form.path.trim().startsWith("/") ? form.path.trim() : `/${form.path.trim()}`,
            description: form.description.trim(),
            content: form.content,
            markdown_content: form.markdown_content,
            custom_css: form.custom_css,
            custom_js: form.custom_js,
            is_published: form.is_published,
            show_comment: form.show_comment,
            sort: Number(form.sort) || 0,
        };
        setBusy(true);
        try {
            if (isNew) {
                await createAdminPageApi(payload);
                toast.success("页面已创建");
            } else {
                await updateAdminPageApi(page.id, payload);
                toast.success("页面已保存");
            }
            onSaved();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "保存失败");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
            <div
                className="flex max-h-[88vh] w-full max-w-3xl flex-col rounded-xl border bg-card p-5 shadow-xl"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="mb-4 flex items-center justify-between gap-2">
                    <h3 className="text-base font-semibold">{isNew ? "新建页面" : `编辑页面 #${page.id}`}</h3>
                    <button
                        type="button"
                        aria-label="关闭"
                        onClick={onClose}
                        className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                        <X className="size-4" />
                    </button>
                </div>

                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <label className="block">
                            <span className="mb-1 block text-xs font-medium text-muted-foreground">标题（必填）</span>
                            <Input value={form.title} onChange={(e) => set("title", e.target.value)} maxLength={100} />
                        </label>
                        <label className="block">
                            <span className="mb-1 block text-xs font-medium text-muted-foreground">
                                路径（必填，如 /message）
                            </span>
                            <Input
                                value={form.path}
                                onChange={(e) => set("path", e.target.value)}
                                placeholder="/message"
                                className="font-mono text-xs"
                            />
                        </label>
                    </div>

                    <label className="block">
                        <span className="mb-1 block text-xs font-medium text-muted-foreground">描述（选填）</span>
                        <Input value={form.description} onChange={(e) => set("description", e.target.value)} />
                    </label>

                    <label className="block">
                        <span className="mb-1 block text-xs font-medium text-muted-foreground">
                            内容 HTML（必填 · 前台渲染的就是这段）
                        </span>
                        <textarea
                            value={form.content}
                            onChange={(e) => set("content", e.target.value)}
                            rows={8}
                            className="w-full rounded-lg border border-input bg-transparent px-3 py-2 font-mono text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                        />
                    </label>

                    <label className="block">
                        <span className="mb-1 block text-xs font-medium text-muted-foreground">
                            Markdown 原文（选填 · 仅存档，不参与前台渲染）
                        </span>
                        <textarea
                            value={form.markdown_content}
                            onChange={(e) => set("markdown_content", e.target.value)}
                            rows={5}
                            className="w-full rounded-lg border border-input bg-transparent px-3 py-2 font-mono text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                        />
                    </label>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <label className="block">
                            <span className="mb-1 block text-xs font-medium text-muted-foreground">自定义 CSS（选填）</span>
                            <textarea
                                value={form.custom_css}
                                onChange={(e) => set("custom_css", e.target.value)}
                                rows={3}
                                className="w-full rounded-lg border border-input bg-transparent px-3 py-2 font-mono text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                            />
                        </label>
                        <label className="block">
                            <span className="mb-1 block text-xs font-medium text-muted-foreground">自定义 JS（选填）</span>
                            <textarea
                                value={form.custom_js}
                                onChange={(e) => set("custom_js", e.target.value)}
                                rows={3}
                                className="w-full rounded-lg border border-input bg-transparent px-3 py-2 font-mono text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                            />
                        </label>
                    </div>

                    <div className="flex flex-wrap items-center gap-5 rounded-lg border px-3 py-2.5 text-sm">
                        <label className="flex items-center gap-2">
                            <Checkbox
                                checked={form.is_published}
                                onCheckedChange={(v) => set("is_published", v === true)}
                                aria-label="是否发布"
                            />
                            发布（前台可访问）
                        </label>
                        <label className="flex items-center gap-2">
                            <Checkbox
                                checked={form.show_comment}
                                onCheckedChange={(v) => set("show_comment", v === true)}
                                aria-label="是否显示评论"
                            />
                            显示评论
                        </label>
                        <label className="ml-auto flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">排序</span>
                            <Input
                                type="number"
                                value={String(form.sort)}
                                onChange={(e) => set("sort", Number(e.target.value) || 0)}
                                className="h-8 w-20 text-xs"
                            />
                        </label>
                    </div>
                </div>

                <div className="mt-4 flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={onClose}>
                        取消
                    </Button>
                    <Button size="sm" disabled={busy} onClick={() => void save()}>
                        {busy ? "保存中…" : isNew ? "创建" : "保存"}
                    </Button>
                </div>
            </div>
        </div>
    );
}
