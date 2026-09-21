"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
    Download,
    FolderTree,
    ImagePlus,
    Images,
    Loader2,
    Pencil,
    Plus,
    RefreshCw,
    Search,
    Trash2,
    Upload,
    X,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PaginationControls } from "@/components/pagination-controls";
import {
    ALBUM_SORT_OPTIONS,
    batchDeleteAdminAlbumsApi,
    batchImportAdminAlbumsApi,
    createAdminAlbumCategoryApi,
    deleteAdminAlbumCategoryApi,
    deleteAdminAlbumApi,
    getAdminAlbumCategoriesApi,
    getAdminAlbumsApi,
    updateAdminAlbumApi,
    updateAdminAlbumCategoryApi,
} from "@/lib/api";
import type { AdminAlbum, AdminAlbumCategory } from "@/lib/api";
import { cn, resolveAssetUrl } from "@/lib/utils";
import { ACTION_TONE } from "@/lib/action-tones";

const PAGE_SIZE = 12;

/** 字节数 → 人类可读 */
function formatSize(bytes?: number): string {
    if (!bytes) return "—";
    const units = ["B", "KB", "MB", "GB"];
    let value = bytes;
    let i = 0;
    while (value >= 1024 && i < units.length - 1) {
        value /= 1024;
        i += 1;
    }
    return `${value >= 100 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

/** ISO → YYYY-MM-DD */
function formatDate(iso?: string): string {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const splitTags = (tags?: string): string[] =>
    (tags ?? "")
        .split(/[,，]/)
        .map((t) => t.trim())
        .filter(Boolean);

/**
 * 相册管理（对齐官方后台：图片 + 分类两组接口）
 * 图片：GET /albums/get · POST /albums/add · PUT /albums/update/:id · DELETE /albums/delete/:id
 *       · DELETE /albums/batch-delete · POST /albums/batch-import
 * 分类：GET/POST /album-categories · PUT/DELETE /album-categories/:id
 */
export function AlbumManager() {
    const [tab, setTab] = useState<"images" | "categories">("images");

    const [categories, setCategories] = useState<AdminAlbumCategory[]>([]);
    const [albums, setAlbums] = useState<AdminAlbum[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [categoryId, setCategoryId] = useState<string>("all");
    const [sort, setSort] = useState<string>("display_order_asc");
    const [tagInput, setTagInput] = useState("");
    const [tag, setTag] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selected, setSelected] = useState<number[]>([]);
    const [busy, setBusy] = useState(false);
    const [editing, setEditing] = useState<AdminAlbum | null>(null);
    const [importOpen, setImportOpen] = useState(false);
    const [categoryDialog, setCategoryDialog] = useState<AdminAlbumCategory | "new" | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);
    const [preview, setPreview] = useState<AdminAlbum | null>(null);

    const loadCategories = useCallback(async () => {
        try {
            const list = await getAdminAlbumCategoriesApi();
            setCategories(list ?? []);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "分类加载失败");
        }
    }, []);

    const loadAlbums = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await getAdminAlbumsApi({
                page,
                pageSize: PAGE_SIZE,
                categoryId: categoryId === "all" ? undefined : categoryId,
                tag: tag || undefined,
                sort,
            });
            setAlbums(data.list ?? []);
            setTotal(data.total ?? 0);
        } catch (e) {
            setError(e instanceof Error ? e.message : "图片列表加载失败");
            setAlbums([]);
        } finally {
            setLoading(false);
        }
    }, [page, categoryId, tag, sort]);

    // 三个 effect 都延后到下一个 tick：effect 内同步 setState 会触发级联渲染（react-hooks/set-state-in-effect）
    useEffect(() => {
        const timer = setTimeout(() => void loadCategories(), 0);
        return () => clearTimeout(timer);
    }, [loadCategories]);

    useEffect(() => {
        const timer = setTimeout(() => void loadAlbums(), 0);
        return () => clearTimeout(timer);
    }, [loadAlbums, refreshKey]);

    useEffect(() => {
        const timer = setTimeout(() => setSelected([]), 0);
        return () => clearTimeout(timer);
    }, [page, categoryId, tag, sort]);

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const reload = () => setRefreshKey((k) => k + 1);
    const categoryName = useMemo(() => {
        const map = new Map(categories.map((c) => [c.id, c.name]));
        return (id?: number | null) => (id != null ? map.get(id) ?? `#${id}` : "未分类");
    }, [categories]);

    const run = async (task: () => Promise<unknown>, okText: string) => {
        setBusy(true);
        try {
            await task();
            toast.success(okText);
            reload();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "操作失败");
        } finally {
            setBusy(false);
        }
    };

    const removeAlbum = (album: AdminAlbum) => {
        if (!window.confirm(`确定删除这张图片吗？\n${album.title || album.imageUrl}`)) return;
        void run(() => deleteAdminAlbumApi(album.id), "图片已删除");
    };

    const removeSelected = () => {
        if (selected.length === 0) return;
        if (!window.confirm(`确定删除选中的 ${selected.length} 张图片吗？`)) return;
        void run(() => batchDeleteAdminAlbumsApi(selected), `已删除 ${selected.length} 张`);
    };

    return (
        <div className="space-y-3">
            {/* ===== 顶部：Tab + 工具 ===== */}
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center overflow-hidden rounded-xl border bg-card shadow-sm">
                    <button
                        type="button"
                        onClick={() => setTab("images")}
                        className={cn(
                            "flex h-9 items-center gap-1.5 px-3 text-xs transition-colors",
                            tab === "images" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-primary"
                        )}
                    >
                        <Images className="size-3.5" />
                        图片
                    </button>
                    <span className="h-5 w-px bg-border" />
                    <button
                        type="button"
                        onClick={() => setTab("categories")}
                        className={cn(
                            "flex h-9 items-center gap-1.5 px-3 text-xs transition-colors",
                            tab === "categories" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-primary"
                        )}
                    >
                        <FolderTree className="size-3.5" />
                        分类
                    </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {tab === "images" ? (
                        <>
                            <div className="relative">
                                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    value={tagInput}
                                    onChange={(e) => setTagInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                            setPage(1);
                                            setTag(tagInput.trim());
                                        }
                                    }}
                                    placeholder="按标签筛选…"
                                    className="h-9 w-36 pl-8 text-xs"
                                />
                            </div>
                            <Select
                                value={categoryId}
                                onValueChange={(v) => {
                                    setCategoryId(v);
                                    setPage(1);
                                }}
                            >
                                <SelectTrigger className="h-9 w-36 rounded-xl text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">全部分类</SelectItem>
                                    {categories.map((c) => (
                                        <SelectItem key={c.id} value={String(c.id)}>
                                            {c.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Select value={sort} onValueChange={setSort}>
                                <SelectTrigger className="h-9 w-32 rounded-xl text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {ALBUM_SORT_OPTIONS.map((o) => (
                                        <SelectItem key={o.value} value={o.value}>
                                            {o.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Button
                                variant="outline"
                                size="icon-sm"
                                aria-label="刷新"
                                title="刷新"
                                className="size-9 rounded-xl"
                                disabled={loading}
                                onClick={reload}
                            >
                                <RefreshCw className={cn("size-4", loading && "animate-spin")} />
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-9 rounded-xl text-xs text-destructive hover:text-destructive"
                                disabled={busy || selected.length === 0}
                                onClick={removeSelected}
                            >
                                <Trash2 className="size-3.5" />
                                删除{selected.length > 0 ? `（${selected.length}）` : ""}
                            </Button>
                            <Button size="sm" className="h-9 rounded-xl text-xs" onClick={() => setImportOpen(true)}>
                                <Upload className="size-3.5" />
                                批量导入
                            </Button>
                        </>
                    ) : (
                        <>
                            <span className="text-xs text-muted-foreground">共 {categories.length} 个分类</span>
                            <Button
                                variant="outline"
                                size="icon-sm"
                                aria-label="刷新分类"
                                title="刷新"
                                className="size-9 rounded-xl"
                                onClick={() => void loadCategories()}
                            >
                                <RefreshCw className="size-4" />
                            </Button>
                            <Button size="sm" className="h-9 rounded-xl text-xs" onClick={() => setCategoryDialog("new")}>
                                <Plus className="size-3.5" />
                                新建分类
                            </Button>
                        </>
                    )}
                </div>
            </div>

            {/* ===== 图片 Tab ===== */}
            {tab === "images" && (
                <>
                    {loading ? (
                        <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground">
                            <Loader2 className="mr-2 size-4 animate-spin" />
                            加载中…
                        </div>
                    ) : error ? (
                        <div className="flex min-h-64 flex-col items-center justify-center gap-2 text-sm">
                            <p className="text-destructive">{error}</p>
                            <Button variant="outline" size="sm" onClick={reload}>
                                重试
                            </Button>
                        </div>
                    ) : albums.length === 0 ? (
                        <div className="flex min-h-64 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                            <ImagePlus className="size-8 opacity-40" />
                            {categoryId !== "all" || tag ? "没有匹配的图片" : "相册里还没有图片"}
                            <Button size="sm" className="mt-1 h-8 rounded-lg text-xs" onClick={() => setImportOpen(true)}>
                                <Upload className="size-3.5" />
                                按 URL 批量导入
                            </Button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
                            {albums.map((album) => {
                                const src = resolveAssetUrl(album.imageUrl) ?? album.imageUrl;
                                const checked = selected.includes(album.id);
                                return (
                                    <div
                                        key={album.id}
                                        className={cn(
                                            "group relative overflow-hidden rounded-xl border bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary hover:shadow-md",
                                            checked && "border-primary ring-1 ring-primary/30"
                                        )}
                                    >
                                        <span className="absolute left-2 top-2 z-10">
                                            <Checkbox
                                                checked={checked}
                                                onCheckedChange={() =>
                                                    setSelected((prev) =>
                                                        prev.includes(album.id)
                                                            ? prev.filter((x) => x !== album.id)
                                                            : [...prev, album.id]
                                                    )
                                                }
                                                aria-label={`选择 ${album.title || album.imageUrl}`}
                                            />
                                        </span>
                                        <span className="absolute right-2 top-2 z-10 hidden gap-1 group-hover:flex">
                                            <button
                                                type="button"
                                                aria-label="编辑"
                                                title="编辑"
                                                onClick={() => setEditing(album)}
                                                className="rounded-md bg-orange-500 p-1 text-white shadow-sm transition-colors hover:bg-orange-600"
                                            >
                                                <Pencil className="size-3.5" />
                                            </button>
                                            <button
                                                type="button"
                                                aria-label="删除"
                                                title="删除"
                                                onClick={() => removeAlbum(album)}
                                                className="rounded-md bg-red-500 p-1 text-white shadow-sm transition-colors hover:bg-red-600"
                                            >
                                                <Trash2 className="size-3.5" />
                                            </button>
                                        </span>

                                        <button
                                            type="button"
                                            onClick={() => setPreview(album)}
                                            title={album.title || album.imageUrl}
                                            className="block w-full"
                                        >
                                            <span className="block aspect-4/3 w-full overflow-hidden bg-muted">
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img
                                                    src={src}
                                                    alt={album.title || ""}
                                                    loading="lazy"
                                                    className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                                                />
                                            </span>
                                            <span className="block space-y-1 p-2.5 text-left">
                                                <span
                                                    className="line-clamp-1 block text-xs font-medium"
                                                    title={album.title || album.imageUrl}
                                                >
                                                    {album.title || "（无标题）"}
                                                </span>
                                                <span className="flex flex-wrap items-center gap-1">
                                                    <Badge variant="outline" className="text-[10px] font-normal">
                                                        {categoryName(album.categoryId)}
                                                    </Badge>
                                                    {splitTags(album.tags).slice(0, 2).map((t) => (
                                                        <Badge key={t} variant="secondary" className="text-[10px] font-normal">
                                                            {t}
                                                        </Badge>
                                                    ))}
                                                </span>
                                                <span className="block text-[10px] text-muted-foreground">
                                                    {album.widthAndHeight || (album.width ? `${album.width}×${album.height}` : "—")}
                                                    {" · "}
                                                    {formatSize(album.fileSize)}
                                                    {" · "}
                                                    {formatDate(album.published_at ?? album.created_at)}
                                                    {album.viewCount ? ` · ${album.viewCount} 次浏览` : ""}
                                                </span>
                                            </span>
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* 分页 */}
                    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                        <span>
                            共 <span className="font-medium text-foreground">{total}</span> 张图片 · 第 {page} / {totalPages} 页
                        </span>
                        <PaginationControls
                            page={page}
                            totalPages={totalPages}
                            disabled={loading}
                            onPageChange={setPage}
                        />
                    </div>
                </>
            )}

            {/* ===== 分类 Tab ===== */}
            {tab === "categories" && (
                <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
                    <div className="hidden min-w-[560px] grid-cols-[60px_1fr_1fr_90px_140px] items-center gap-3 border-b bg-muted/40 px-4 py-2.5 text-xs font-medium text-muted-foreground sm:grid">
                        <span>ID</span>
                        <span>名称</span>
                        <span>描述</span>
                        <span className="text-center">排序</span>
                        <span className="text-right">操作</span>
                    </div>
                    <div className="sm:min-w-[560px]">
                        {categories.length === 0 ? (
                            <p className="px-4 py-12 text-center text-sm text-muted-foreground">还没有相册分类</p>
                        ) : (
                            categories.map((c) => (
                                <div
                                    key={c.id}
                                    className="grid grid-cols-1 items-center gap-x-3 gap-y-1 border-b px-4 py-3 text-sm transition-colors last:border-b-0 hover:bg-muted/40 sm:grid-cols-[60px_1fr_1fr_90px_140px]"
                                >
                                    <span className="font-mono text-xs text-muted-foreground">{c.id}</span>
                                    <span className="font-medium">{c.name}</span>
                                    <span className="truncate text-xs text-muted-foreground" title={c.description}>
                                        {c.description || "—"}
                                    </span>
                                    <span className="text-center text-xs tabular-nums text-muted-foreground">
                                        {c.displayOrder}
                                    </span>
                                    <span className="flex justify-end gap-1">
                                        <Button
                                            variant="ghost"
                                            size="icon-sm"
                                            aria-label="编辑分类"
                                            title="编辑"
                                            className={ACTION_TONE.edit}
                                            onClick={() => setCategoryDialog(c)}
                                        >
                                            <Pencil className="size-3.5" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon-sm"
                                            aria-label="删除分类"
                                            title="删除"
                                            className={ACTION_TONE.delete}
                                            disabled={busy}
                                            onClick={() => {
                                                if (!window.confirm(`确定删除分类「${c.name}」吗？该分类下的图片会变成未分类。`)) return;
                                                void run(() => deleteAdminAlbumCategoryApi(c.id), "分类已删除");
                                            }}
                                        >
                                            <Trash2 className="size-3.5" />
                                        </Button>
                                    </span>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            {/* ===== 大图预览 ===== */}
            {preview && (
                <div
                    className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/75 p-4"
                    onMouseDown={() => setPreview(null)}
                >
                    <div className="flex max-h-full max-w-full items-center justify-center" onMouseDown={(e) => e.stopPropagation()}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={resolveAssetUrl(preview.bigImageUrl || preview.imageUrl) ?? preview.imageUrl}
                            alt={preview.title || ""}
                            className="max-h-[78vh] max-w-full rounded-lg object-contain shadow-2xl"
                        />
                    </div>
                    <div
                        className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-white/90"
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        <span className="max-w-[60vw] truncate">{preview.title || preview.imageUrl}</span>
                        <span className="text-white/60">
                            {preview.widthAndHeight} · {formatSize(preview.fileSize)} · {preview.format}
                        </span>
                        {preview.downloadUrl && (
                            <a
                                href={resolveAssetUrl(preview.downloadUrl) ?? preview.downloadUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-white"
                            >
                                <Download className="size-3" />
                                下载原图
                            </a>
                        )}
                        <button
                            type="button"
                            onClick={() => setPreview(null)}
                            className="rounded border border-white/30 px-2 py-0.5 transition-colors hover:bg-white/10"
                        >
                            关闭（Esc）
                        </button>
                    </div>
                </div>
            )}

            {/* ===== 编辑图片 ===== */}
            {editing && (
                <AlbumEditorDialog
                    album={editing}
                    categories={categories}
                    busy={busy}
                    onClose={() => setEditing(null)}
                    onSaved={() => {
                        setEditing(null);
                        reload();
                    }}
                    setBusy={setBusy}
                />
            )}

            {/* ===== 批量导入 ===== */}
            {importOpen && (
                <AlbumImportDialog
                    categories={categories}
                    busy={busy}
                    setBusy={setBusy}
                    onClose={() => setImportOpen(false)}
                    onDone={() => {
                        setImportOpen(false);
                        reload();
                    }}
                />
            )}

            {/* ===== 分类新建 / 编辑 ===== */}
            {categoryDialog && (
                <CategoryDialog
                    category={categoryDialog === "new" ? null : categoryDialog}
                    busy={busy}
                    setBusy={setBusy}
                    onClose={() => setCategoryDialog(null)}
                    onSaved={() => {
                        setCategoryDialog(null);
                        void loadCategories();
                    }}
                />
            )}
        </div>
    );
}

/** 编辑图片信息（标题 / 描述 / 分类 / 标签 / 位置 / 排序 / 发布时间） */
function AlbumEditorDialog({
    album,
    categories,
    busy,
    setBusy,
    onClose,
    onSaved,
}: {
    album: AdminAlbum;
    categories: AdminAlbumCategory[];
    busy: boolean;
    setBusy: (v: boolean) => void;
    onClose: () => void;
    onSaved: () => void;
}) {
    const [form, setForm] = useState({
        title: album.title ?? "",
        description: album.description ?? "",
        categoryId: album.categoryId != null ? String(album.categoryId) : "none",
        tags: splitTags(album.tags).join(", "),
        location: album.location ?? "",
        displayOrder: String(album.displayOrder ?? 0),
    });

    const save = async () => {
        setBusy(true);
        try {
            await updateAdminAlbumApi(album.id, {
                // 远端 imageUrl 必填，原样带回
                imageUrl: album.imageUrl,
                bigImageUrl: album.bigImageUrl || undefined,
                downloadUrl: album.downloadUrl || undefined,
                title: form.title.trim(),
                description: form.description.trim(),
                location: form.location.trim(),
                categoryId: form.categoryId === "none" ? null : Number(form.categoryId),
                tags: splitTags(form.tags),
                displayOrder: Number(form.displayOrder) || 0,
            });
            toast.success("已保存");
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
                className="flex max-h-[88vh] w-full max-w-xl flex-col rounded-xl border bg-card p-5 shadow-xl"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="mb-3 flex items-center justify-between gap-2">
                    <h3 className="text-base font-semibold">编辑图片 #{album.id}</h3>
                    <button
                        type="button"
                        aria-label="关闭"
                        onClick={onClose}
                        className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                        <X className="size-4" />
                    </button>
                </div>

                <div className="mb-3 flex items-start gap-3 rounded-lg border p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={resolveAssetUrl(album.imageUrl) ?? album.imageUrl}
                        alt=""
                        className="size-20 shrink-0 rounded-md object-cover"
                    />
                    <div className="min-w-0 text-xs text-muted-foreground">
                        <p className="truncate" title={album.imageUrl}>
                            {album.imageUrl}
                        </p>
                        <p className="mt-1">
                            {album.widthAndHeight || `${album.width ?? "?"}×${album.height ?? "?"}`} ·{" "}
                            {formatSize(album.fileSize)} · {album.format || "未知格式"}
                        </p>
                    </div>
                </div>

                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                    <label className="block">
                        <span className="mb-1 block text-xs font-medium text-muted-foreground">标题</span>
                        <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                    </label>
                    <label className="block">
                        <span className="mb-1 block text-xs font-medium text-muted-foreground">描述</span>
                        <textarea
                            value={form.description}
                            onChange={(e) => setForm({ ...form, description: e.target.value })}
                            rows={3}
                            className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                        />
                    </label>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <label className="block">
                            <span className="mb-1 block text-xs font-medium text-muted-foreground">分类</span>
                            <Select
                                value={form.categoryId}
                                onValueChange={(v) => setForm({ ...form, categoryId: v })}
                            >
                                <SelectTrigger className="h-9 w-full text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">未分类</SelectItem>
                                    {categories.map((c) => (
                                        <SelectItem key={c.id} value={String(c.id)}>
                                            {c.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </label>
                        <label className="block">
                            <span className="mb-1 block text-xs font-medium text-muted-foreground">
                                排序（越小越靠前）
                            </span>
                            <Input
                                type="number"
                                value={form.displayOrder}
                                onChange={(e) => setForm({ ...form, displayOrder: e.target.value })}
                            />
                        </label>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <label className="block">
                            <span className="mb-1 block text-xs font-medium text-muted-foreground">
                                标签（逗号分隔）
                            </span>
                            <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
                        </label>
                        <label className="block">
                            <span className="mb-1 block text-xs font-medium text-muted-foreground">拍摄地点</span>
                            <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
                        </label>
                    </div>
                </div>

                <div className="mt-4 flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={onClose}>
                        取消
                    </Button>
                    <Button size="sm" disabled={busy} onClick={() => void save()}>
                        {busy ? "保存中…" : "保存"}
                    </Button>
                </div>
            </div>
        </div>
    );
}

/** 批量导入：一行一个图片 URL（最多 100） */
function AlbumImportDialog({
    categories,
    busy,
    setBusy,
    onClose,
    onDone,
}: {
    categories: AdminAlbumCategory[];
    busy: boolean;
    setBusy: (v: boolean) => void;
    onClose: () => void;
    onDone: () => void;
}) {
    const [urls, setUrls] = useState("");
    const [categoryId, setCategoryId] = useState("none");
    const [tags, setTags] = useState("");
    const [displayOrder, setDisplayOrder] = useState("0");

    const list = urls
        .split(/[\r\n]+/)
        .map((u) => u.trim())
        .filter(Boolean);

    const submit = async () => {
        if (list.length === 0) {
            toast.error("请至少填一个图片地址");
            return;
        }
        if (list.length > 100) {
            toast.error("一次最多 100 个地址");
            return;
        }
        setBusy(true);
        try {
            const res = await batchImportAdminAlbumsApi({
                urls: list,
                categoryId: categoryId === "none" ? null : Number(categoryId),
                tags: splitTags(tags),
                displayOrder: Number(displayOrder) || 0,
            });
            toast.success(
                `导入完成：成功 ${res.successCount} · 失败 ${res.failCount} · 跳过 ${res.skipCount}（共 ${res.total}）`
            );
            if (res.errors?.length) {
                for (const e of res.errors.slice(0, 3)) toast.error(`${e.url}：${e.reason}`);
            }
            onDone();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "导入失败");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
            <div
                className="flex max-h-[88vh] w-full max-w-2xl flex-col rounded-xl border bg-card p-5 shadow-xl"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="mb-3 flex items-center justify-between gap-2">
                    <h3 className="text-base font-semibold">批量导入图片</h3>
                    <button
                        type="button"
                        aria-label="关闭"
                        onClick={onClose}
                        className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                        <X className="size-4" />
                    </button>
                </div>
                <p className="mb-3 text-xs text-muted-foreground">
                    一行一个图片地址（最多 100 个），后端会自动抓取并解析尺寸、大小、格式与哈希；重复的会自动跳过。
                </p>

                <label className="block">
                    <span className="mb-1 block text-xs font-medium text-muted-foreground">
                        图片地址（已识别 {list.length} 个）
                    </span>
                    <textarea
                        value={urls}
                        onChange={(e) => setUrls(e.target.value)}
                        rows={8}
                        placeholder={"https://example.com/a.jpg\nhttps://example.com/b.png"}
                        className="w-full rounded-lg border border-input bg-transparent px-3 py-2 font-mono text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    />
                </label>

                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <label className="block">
                        <span className="mb-1 block text-xs font-medium text-muted-foreground">分类</span>
                        <Select value={categoryId} onValueChange={setCategoryId}>
                            <SelectTrigger className="h-9 w-full text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">未分类</SelectItem>
                                {categories.map((c) => (
                                    <SelectItem key={c.id} value={String(c.id)}>
                                        {c.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </label>
                    <label className="block">
                        <span className="mb-1 block text-xs font-medium text-muted-foreground">标签（逗号分隔）</span>
                        <Input value={tags} onChange={(e) => setTags(e.target.value)} className="h-9 text-xs" />
                    </label>
                    <label className="block">
                        <span className="mb-1 block text-xs font-medium text-muted-foreground">起始排序</span>
                        <Input
                            type="number"
                            value={displayOrder}
                            onChange={(e) => setDisplayOrder(e.target.value)}
                            className="h-9 text-xs"
                        />
                    </label>
                </div>

                <div className="mt-4 flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={onClose}>
                        取消
                    </Button>
                    <Button size="sm" disabled={busy || list.length === 0} onClick={() => void submit()}>
                        {busy ? "导入中…" : `导入 ${list.length} 张`}
                    </Button>
                </div>
            </div>
        </div>
    );
}

/** 新建 / 编辑相册分类 */
function CategoryDialog({
    category,
    busy,
    setBusy,
    onClose,
    onSaved,
}: {
    category: AdminAlbumCategory | null;
    busy: boolean;
    setBusy: (v: boolean) => void;
    onClose: () => void;
    onSaved: () => void;
}) {
    const isNew = !category;
    const [form, setForm] = useState({
        name: category?.name ?? "",
        description: category?.description ?? "",
        displayOrder: String(category?.displayOrder ?? 0),
    });

    const save = async () => {
        if (!form.name.trim()) {
            toast.error("分类名称必填");
            return;
        }
        setBusy(true);
        try {
            const body = {
                name: form.name.trim(),
                description: form.description.trim(),
                displayOrder: Number(form.displayOrder) || 0,
            };
            if (isNew) await createAdminAlbumCategoryApi(body);
            else await updateAdminAlbumCategoryApi(category.id, body);
            toast.success(isNew ? "分类已创建" : "分类已保存");
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
                className="w-full max-w-sm rounded-xl border bg-card p-5 shadow-xl"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <h3 className="mb-3 text-base font-semibold">{isNew ? "新建相册分类" : `编辑分类 #${category.id}`}</h3>
                <div className="space-y-3">
                    <label className="block">
                        <span className="mb-1 block text-xs font-medium text-muted-foreground">名称（必填）</span>
                        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                    </label>
                    <label className="block">
                        <span className="mb-1 block text-xs font-medium text-muted-foreground">描述（选填）</span>
                        <Input
                            value={form.description}
                            onChange={(e) => setForm({ ...form, description: e.target.value })}
                        />
                    </label>
                    <label className="block">
                        <span className="mb-1 block text-xs font-medium text-muted-foreground">排序（越小越靠前）</span>
                        <Input
                            type="number"
                            value={form.displayOrder}
                            onChange={(e) => setForm({ ...form, displayOrder: e.target.value })}
                        />
                    </label>
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
