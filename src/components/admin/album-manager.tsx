"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
    Download,
    FileUp,
    Loader2,
    Pencil,
    Plus,
    RefreshCw,
    Trash2,
    Upload,
    X,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/confirm-provider";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PaginationControls } from "@/components/pagination-controls";
import { AdminTabBar } from "@/components/admin/admin-tabs";
import { AdminFilterBar } from "@/components/admin/filter-bar";
import { AdminEmptyState } from "@/components/admin/empty-state";
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
import { exportAdminAlbumsApi, importAdminAlbumsFileApi } from "@/lib/api-album-io";
import type { AdminAlbumExportFormat, AdminAlbumFileImportResult } from "@/lib/api-album-io";
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

/** 用浏览器下载一个 blob（导出相册用，同源代理原样透传文件流） */
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
 * 相册管理（对齐官方后台：图片 + 分类两组接口）
 * 图片：GET /albums/get · POST /albums/add · PUT /albums/update/:id · DELETE /albums/delete/:id
 *       · DELETE /albums/batch-delete · POST /albums/batch-import（按 URL 导入）
 *       · POST /albums/import（文件导入，multipart）· POST /albums/export（导出文件流）
 * 分类：GET/POST /album-categories · PUT/DELETE /album-categories/:id
 * ⚠️ 导入 / 导出都是写库或重活：导入**未在线上实测**（线上只做 GET 探测）。
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
    /** 文件导入（.json / .zip）弹窗 */
    const [fileImportOpen, setFileImportOpen] = useState(false);
    /** 导出弹窗 */
    const [exportOpen, setExportOpen] = useState(false);
    const [categoryDialog, setCategoryDialog] = useState<AdminAlbumCategory | "new" | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);
    const [preview, setPreview] = useState<AdminAlbum | null>(null);

    // 应用内确认弹窗（替代 window.confirm，见 components/confirm-provider.tsx）
    const confirm = useConfirm();

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

    const removeAlbum = async (album: AdminAlbum) => {
        if (!(await confirm({ title: "确定删除这张图片吗？", description: album.title || album.imageUrl, danger: true }))) return;
        void run(() => deleteAdminAlbumApi(album.id), "图片已删除");
    };

    const removeSelected = async () => {
        if (selected.length === 0) return;
        if (!(await confirm({ title: `确定删除选中的 ${selected.length} 张图片吗？`, danger: true }))) return;
        void run(() => batchDeleteAdminAlbumsApi(selected), `已删除 ${selected.length} 张`);
    };

    return (
        // admin-card：吃掉剩余高度；Tab/工具固定在卡片顶部，内容在 admin-scroll 内部滚动
        <div className="admin-card">
            {/* ===== 页签单独一行，筛选另起一行 ===== */}
            <AdminTabBar
                tabs={[
                    { key: "images", label: "图片" },
                    { key: "categories", label: "分类" },
                ]}
                value={tab}
                onChange={(key) => setTab(key)}
            />
            <AdminFilterBar
                search={
                    tab === "images"
                        ? {
                              value: tagInput,
                              onChange: setTagInput,
                              placeholder: "按标签筛选…",
                              ariaLabel: "按标签筛选",
                              onSubmit: () => {
                                  setPage(1);
                                  setTag(tagInput.trim());
                              },
                          }
                        : undefined
                }
                onReset={
                    tab === "images"
                        ? () => {
                              setTagInput("");
                              setTag("");
                              setCategoryId("all");
                              setPage(1);
                          }
                        : undefined
                }
                resetDisabled={tab === "images" ? !tagInput && !tag && categoryId === "all" : true}
                summary={tab === "categories" ? <>共 {categories.length} 个分类</> : undefined}
                actions={
                    tab === "images" ? (
                        <>
                            <Button
                                variant="outline"
                                size="icon-sm"
                                aria-label="刷新"
                                title="刷新"
                                className="size-8 shrink-0"
                                disabled={loading}
                                onClick={reload}
                            >
                                <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-8 shrink-0 text-sm text-destructive hover:text-destructive"
                                disabled={busy || selected.length === 0}
                                onClick={removeSelected}
                            >
                                <Trash2 className="size-3.5" />
                                <span className="hidden sm:inline">
                                    删除{selected.length > 0 ? `（${selected.length}）` : ""}
                                </span>
                            </Button>
                            <Button size="sm" className="h-8 shrink-0 text-sm" onClick={() => setImportOpen(true)}>
                                <Upload className="size-3.5" />
                                <span className="hidden sm:inline">批量导入</span>
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-8 shrink-0 text-sm"
                                onClick={() => setFileImportOpen(true)}
                            >
                                <FileUp className="size-3.5" />
                                <span className="hidden sm:inline">文件导入</span>
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-8 shrink-0 text-sm"
                                onClick={() => setExportOpen(true)}
                            >
                                <Download className="size-3.5" />
                                <span className="hidden sm:inline">
                                    导出{selected.length > 0 ? `（${selected.length}）` : ""}
                                </span>
                            </Button>
                        </>
                    ) : (
                        <>
                            <Button
                                variant="outline"
                                size="icon-sm"
                                aria-label="刷新分类"
                                title="刷新"
                                className="size-8 shrink-0"
                                onClick={() => void loadCategories()}
                            >
                                <RefreshCw className="size-3.5" />
                            </Button>
                            <Button size="sm" className="h-8 shrink-0 text-sm" onClick={() => setCategoryDialog("new")}>
                                <Plus className="size-3.5" />
                                <span className="hidden sm:inline">新建分类</span>
                            </Button>
                        </>
                    )
                }
            >
                {tab === "images" && (
                    <>
                        <Select
                            value={categoryId}
                            onValueChange={(v) => {
                                setCategoryId(v);
                                setPage(1);
                            }}
                        >
                            <SelectTrigger className="h-8 w-full shrink-0 text-sm sm:w-32" aria-label="按分类筛选">
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
                            <SelectTrigger className="h-8 w-full shrink-0 text-sm sm:w-32" aria-label="排序">
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
                    </>
                )}
            </AdminFilterBar>

            {/* ===== 图片 Tab ===== */}
            {tab === "images" && (
                <>
                    {/* 唯一的滚动区：状态提示 / 图片网格都在卡片内部滚动，分页固定在卡片底部 */}
                    <div className="admin-scroll">
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
                            <AdminEmptyState
                                kind="media"
                                filtered={categoryId !== "all" || Boolean(tag)}
                                title={categoryId !== "all" || tag ? undefined : "相册里还没有图片"}
                                description={
                                    categoryId !== "all" || tag
                                        ? undefined
                                        : "上传图片或按 URL 批量导入，图片会按分类和标签整理"
                                }
                                action={
                                    <Button size="sm" className="h-8 text-xs" onClick={() => setImportOpen(true)}>
                                        <Upload className="size-3.5" />
                                        按 URL 批量导入
                                    </Button>
                                }
                            />
                        ) : (
                            <div className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
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

                    </div>

                    {/* 分页：固定在卡片底部，不随内容滚动 */}
                    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t p-3 text-xs text-muted-foreground">
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
                <div className="admin-scroll">
                    <div className="admin-sticky-head admin-list-head min-w-[560px] grid-cols-[60px_1fr_1fr_90px_140px] items-center gap-3 border-b px-4 py-2 text-xs font-medium text-muted-foreground grid">
                        <span>ID</span>
                        <span>名称</span>
                        <span>描述</span>
                        <span className="text-center">排序</span>
                        <span className="text-right">操作</span>
                    </div>
                    <div className="min-w-[560px]">
                        {categories.length === 0 ? (
                            <AdminEmptyState
                                kind="generic"
                                title="还没有相册分类"
                                description="分类只是给图片分组用的标签，先建一个「风景」「日常」之类的即可"
                            />
                        ) : (
                            categories.map((c) => (
                                <div
                                    key={c.id}
                                    className="grid admin-list-row items-center gap-x-3 gap-y-1 border-b px-4 py-3 text-sm transition-colors last:border-b-0 hover:bg-muted/40 grid-cols-[60px_1fr_1fr_90px_140px]"
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
                                            size="icon"
                                            aria-label="编辑分类"
                                            title="编辑"
                                            className={ACTION_TONE.edit}
                                            onClick={() => setCategoryDialog(c)}
                                        >
                                            <Pencil className="size-3.5" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            aria-label="删除分类"
                                            title="删除"
                                            className={ACTION_TONE.delete}
                                            disabled={busy}
                                            onClick={() => {
                                                void (async () => {
                                                    if (
                                                        !(await confirm({
                                                            title: `确定删除分类「${c.name}」吗？`,
                                                            description: "该分类下的图片会变成未分类。",
                                                            danger: true,
                                                        }))
                                                    )
                                                        return;
                                                    void run(() => deleteAdminAlbumCategoryApi(c.id), "分类已删除");
                                                })();
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

            {/* ===== 批量导入（按 URL） ===== */}
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

            {/* ===== 文件导入（.json / .zip） ===== */}
            {fileImportOpen && (
                <AlbumFileImportDialog
                    categories={categories}
                    onClose={() => setFileImportOpen(false)}
                    onDone={reload}
                />
            )}

            {/* ===== 导出（JSON / ZIP 文件流） ===== */}
            {exportOpen && (
                <AlbumExportDialog
                    selectedIds={selected}
                    total={total}
                    onClose={() => setExportOpen(false)}
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
                className="flex max-h-[88vh] w-full max-w-xl flex-col rounded-xl border bg-card p-4 shadow-xl"
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

                <div className="mt-3 flex justify-end gap-2">
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
                className="flex max-h-[88vh] w-full max-w-2xl flex-col rounded-xl border bg-card p-4 shadow-xl"
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

                <div className="mt-3 flex justify-end gap-2">
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
                className="w-full max-w-sm rounded-xl border bg-card p-4 shadow-xl"
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
                <div className="mt-3 flex justify-end gap-2">
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

/**
 * 文件导入：上传 .json / .zip（远端 POST /albums/import，multipart）。
 *
 * 契约（pkg/handler/album/handler.go:505-601）：
 *  - file 必填，按扩展名分支：.json 直接解析、.zip 取包内 albums.json；
 *  - skip_existing（默认 true，本地始终显式传）、overwrite_existing（默认 false）、
 *    default_category_id（可选）；
 *  - 返回 { total_count, success_count, skipped_count, failed_count, created_ids, errors? }。
 *
 * ⚠️ 会写相册表：提交前必须过二次确认（确认文案里写清文件、策略与后果）；
 *    本轮实现未在线上实测（线上只做 GET 探测）。
 */
function AlbumFileImportDialog({
    categories,
    onClose,
    onDone,
}: {
    categories: AdminAlbumCategory[];
    onClose: () => void;
    onDone: () => void;
}) {
    const [file, setFile] = useState<File | null>(null);
    const [skipExisting, setSkipExisting] = useState(true);
    const [overwriteExisting, setOverwriteExisting] = useState(false);
    const [categoryId, setCategoryId] = useState("none");
    const [busy, setBusy] = useState(false);
    /** 导入结果（非空时弹窗切成结果视图） */
    const [result, setResult] = useState<AdminAlbumFileImportResult | null>(null);

    // 应用内确认弹窗（替代 window.confirm，见 components/confirm-provider.tsx）
    const confirm = useConfirm();

    /** 选文件：只收 .json / .zip，与远端分支口径一致（handler.go:562-575） */
    const pickFile = (input: HTMLInputElement) => {
        const next = input.files?.[0] ?? null;
        if (!next) {
            setFile(null);
            return;
        }
        const lower = next.name.toLowerCase();
        if (!lower.endsWith(".json") && !lower.endsWith(".zip")) {
            toast.error("仅支持 .json 或 .zip 文件");
            input.value = "";
            setFile(null);
            return;
        }
        if (next.size > 50 * 1024 * 1024) {
            toast.error("文件大小不能超过 50MB");
            input.value = "";
            setFile(null);
            return;
        }
        setFile(next);
    };

    const submit = async () => {
        if (!file) {
            toast.error("请先选择相册数据文件");
            return;
        }
        const categoryLabel =
            categoryId === "none"
                ? "不设置默认分类"
                : categories.find((c) => String(c.id) === categoryId)?.name ?? `#${categoryId}`;
        if (
            !(await confirm({
                title: `确定导入文件「${file.name}」（${formatSize(file.size)}）吗？`,
                description:
                    `重复项：${skipExisting ? "跳过" : overwriteExisting ? "覆盖" : "照常新增"}；` +
                    `默认分类：${categoryLabel}。\n导入会写入相册库，此操作不可撤销。`,
            }))
        ) {
            return;
        }
        setBusy(true);
        try {
            const res = await importAdminAlbumsFileApi({
                file,
                skipExisting,
                overwriteExisting,
                defaultCategoryId: categoryId === "none" ? null : Number(categoryId),
            });
            setResult(res);
            toast.success(
                `导入完成：成功 ${res.success_count} · 跳过 ${res.skipped_count} · 失败 ${res.failed_count}（共 ${res.total_count}）`
            );
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
                className="flex max-h-[88vh] w-full max-w-xl flex-col rounded-xl border bg-card p-4 shadow-xl"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="mb-3 flex items-center justify-between gap-2">
                    <h3 className="text-base font-semibold">文件导入相册</h3>
                    <button
                        type="button"
                        aria-label="关闭"
                        onClick={onClose}
                        className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                        <X className="size-4" />
                    </button>
                </div>

                {result ? (
                    <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                            {[
                                { label: "成功", value: result.success_count, cls: "text-green-600 dark:text-green-400" },
                                { label: "跳过", value: result.skipped_count, cls: "text-amber-600 dark:text-amber-400" },
                                { label: "失败", value: result.failed_count, cls: "text-red-600 dark:text-red-400" },
                                { label: "总计", value: result.total_count, cls: "text-foreground" },
                            ].map((cell) => (
                                // 指标块：与列表页统计磁贴同一套密度（px-3 py-2 + text-lg）
                                <div key={cell.label} className="rounded-lg border bg-muted/40 px-3 py-2 text-center">
                                    <p className={`text-lg font-semibold tabular-nums ${cell.cls}`}>{cell.value}</p>
                                    <p className="mt-0.5 text-xs text-muted-foreground">{cell.label}</p>
                                </div>
                            ))}
                        </div>
                        {result.errors?.length ? (
                            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                                <p className="mb-1 text-xs font-medium text-destructive">
                                    失败原因（{result.errors.length}）
                                </p>
                                <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-muted-foreground">
                                    {result.errors.slice(0, 8).map((msg, i) => (
                                        <li key={`${msg}-${i}`} className="break-all">
                                            {msg}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ) : null}
                        <div className="flex justify-end gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    setResult(null);
                                    setFile(null);
                                }}
                            >
                                继续导入
                            </Button>
                            <Button size="sm" onClick={onClose}>
                                完成
                            </Button>
                        </div>
                    </div>
                ) : (
                    <>
                        <p className="mb-3 text-xs text-muted-foreground">
                            上传导出的相册数据文件（.json 或 .zip，单文件不超过 50MB）；ZIP 内需要包含 albums.json。
                            该操作会写入相册库，重复项按下面选择的策略处理。
                        </p>

                        <div className="rounded-lg border border-dashed p-4">
                            <input
                                type="file"
                                accept=".json,.zip"
                                onChange={(e) => pickFile(e.target)}
                                className="block w-full text-xs file:mr-3 file:rounded-md file:border file:bg-muted file:px-3 file:py-1.5 file:text-xs hover:file:bg-muted/70"
                            />
                            <p className="mt-2 text-xs text-muted-foreground">
                                {file ? `已选择：${file.name}（${formatSize(file.size)}）` : "尚未选择文件"}
                            </p>
                        </div>

                        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <label className="flex items-start gap-2 rounded-lg border p-2.5 text-xs">
                                <Checkbox
                                    checked={skipExisting}
                                    onCheckedChange={(v) => {
                                        const next = v === true;
                                        setSkipExisting(next);
                                        // 与官方前端一致：开启「跳过已存在」时关掉「覆盖已存在」
                                        if (next) setOverwriteExisting(false);
                                    }}
                                    aria-label="跳过已存在"
                                />
                                <span>
                                    <span className="block font-medium text-foreground">跳过已存在</span>
                                    <span className="block text-muted-foreground">重复项直接跳过，适合增量导入</span>
                                </span>
                            </label>
                            <label className="flex items-start gap-2 rounded-lg border p-2.5 text-xs">
                                <Checkbox
                                    checked={overwriteExisting}
                                    disabled={skipExisting}
                                    onCheckedChange={(v) => setOverwriteExisting(v === true)}
                                    aria-label="覆盖已存在"
                                />
                                <span>
                                    <span className="block font-medium text-foreground">覆盖已存在</span>
                                    <span className="block text-muted-foreground">用于修正旧数据，风险更高</span>
                                </span>
                            </label>
                        </div>

                        <label className="mt-3 block">
                            <span className="mb-1 block text-xs font-medium text-muted-foreground">默认分类</span>
                            <Select value={categoryId} onValueChange={setCategoryId}>
                                <SelectTrigger className="h-9 w-full text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">不设置默认分类</SelectItem>
                                    {categories.map((c) => (
                                        <SelectItem key={c.id} value={String(c.id)}>
                                            {c.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </label>

                        <div className="mt-3 flex justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={onClose}>
                                取消
                            </Button>
                            <Button size="sm" disabled={busy || !file} onClick={() => void submit()}>
                                {busy ? "导入中…" : "开始导入"}
                            </Button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

/**
 * 导出相册：POST /albums/export → 远端文件流（json 是裸导出结构、zip 是压缩包，
 * 两者都带 Content-Disposition），同源代理原样透传，这里落盘下载。
 * 勾选了图片就只导出勾选的，否则导出全部（与官方 AlbumExportDialog 口径一致）。
 */
function AlbumExportDialog({
    selectedIds,
    total,
    onClose,
}: {
    selectedIds: number[];
    total: number;
    onClose: () => void;
}) {
    const [format, setFormat] = useState<AdminAlbumExportFormat>("json");
    const [busy, setBusy] = useState(false);

    const hasSelection = selectedIds.length > 0;
    const exportCount = hasSelection ? selectedIds.length : total;

    const handleExport = async () => {
        setBusy(true);
        try {
            const { blob, filename } = await exportAdminAlbumsApi({
                albumIds: hasSelection ? selectedIds : [],
                format,
            });
            const fallback = `albums-export-${new Date().toISOString().slice(0, 10)}.${format}`;
            downloadBlob(blob, filename || fallback);
            toast.success(hasSelection ? `已导出选中的 ${selectedIds.length} 张` : "已导出全部图片", {
                description: format === "zip" ? "ZIP 内含 albums.json，可在「文件导入」里回灌" : "JSON 可直接在「文件导入」里回灌",
            });
            onClose();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "导出失败");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
            <div
                className="w-full max-w-md rounded-xl border bg-card p-4 shadow-xl"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="mb-3 flex items-center justify-between gap-2">
                    <h3 className="text-base font-semibold">导出相册</h3>
                    <button
                        type="button"
                        aria-label="关闭"
                        onClick={onClose}
                        className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                        <X className="size-4" />
                    </button>
                </div>

                <p className="text-xs text-muted-foreground">
                    {hasSelection
                        ? `即将导出选中的 ${selectedIds.length} 张图片。`
                        : `未选择具体项，将导出全部图片（共 ${total} 张）。`}
                </p>

                <label className="mt-3 block">
                    <span className="mb-1 block text-xs font-medium text-muted-foreground">导出格式</span>
                    <Select value={format} onValueChange={(v) => setFormat(v as AdminAlbumExportFormat)}>
                        <SelectTrigger className="h-9 w-full text-xs">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="json">JSON（纯文本）</SelectItem>
                            <SelectItem value="zip">ZIP（压缩包）</SelectItem>
                        </SelectContent>
                    </Select>
                    <span className="mt-1 block text-xs text-muted-foreground">
                        本次导出数据量：{exportCount} 张
                    </span>
                </label>

                <div className="mt-3 flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={onClose}>
                        取消
                    </Button>
                    <Button size="sm" disabled={busy} onClick={() => void handleExport()}>
                        {busy ? "导出中…" : "导出"}
                    </Button>
                </div>
            </div>
        </div>
    );
}
