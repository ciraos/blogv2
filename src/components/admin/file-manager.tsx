"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
    ArrowDownAZ,
    ArrowUpAZ,
    ChevronRight,
    Copy,
    Download,
    Eye,
    File,
    FileArchive,
    FileAudio,
    FileCode,
    FileImage,
    FilePlus2,
    FileText,
    FileVideo,
    Folder,
    FolderPlus,
    HardDrive,
    LayoutGrid,
    List,
    Loader2,
    Move,
    Pencil,
    RefreshCw,
    Search,
    Trash2,
    X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
    FILE_ROOT_URI,
    adminFileDownloadUrl,
    adminThumbnailUrl,
    copyAdminFilesApi,
    createAdminFileApi,
    deleteAdminFilesApi,
    getAdminFileInfoApi,
    getAdminFilesApi,
    getAdminFolderSizeApi,
    getCachedThumbnailSignApi,
    moveAdminFilesApi,
    renameAdminFileApi,
} from "@/lib/api";
import type { AdminFileItem, AdminFileListData, AdminFolderSize } from "@/lib/api";
import { cn } from "@/lib/utils";

type ViewMode = "grid" | "list";
type SortKey = "name" | "size" | "updated_at" | "type";

/** 文件类型分组（顺序即「类型排序」时的展示顺序，文件夹恒在最前） */
type FileCategory = "folder" | "image" | "video" | "audio" | "archive" | "code" | "doc" | "other";

const CATEGORY_ORDER: FileCategory[] = ["folder", "image", "video", "audio", "archive", "code", "doc", "other"];

const CATEGORY_LABEL: Record<FileCategory, string> = {
    folder: "文件夹",
    image: "图片",
    video: "视频",
    audio: "音频",
    archive: "压缩包",
    code: "代码",
    doc: "文档",
    other: "其他",
};

const EXT_BY_CATEGORY: Record<Exclude<FileCategory, "folder" | "other">, string[]> = {
    image: ["png", "jpg", "jpeg", "gif", "webp", "avif", "svg", "bmp", "ico"],
    video: ["mp4", "mkv", "mov", "avi", "webm", "flv", "m4v"],
    audio: ["mp3", "flac", "wav", "aac", "ogg", "m4a"],
    archive: ["zip", "rar", "7z", "tar", "gz", "bz2"],
    code: [
        "js", "ts", "tsx", "jsx", "go", "py", "java", "c", "cpp", "cs", "php", "rb", "rs", "sh",
        "json", "yml", "yaml", "toml", "xml", "sql", "css", "scss", "html",
    ],
    doc: ["md", "txt", "log", "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "csv"],
};

/** 对话框：重命名/新建走输入框，移动/复制走目录选择器 */
type DialogState =
    | {
          kind: "prompt";
          title: string;
          placeholder?: string;
          defaultValue?: string;
          confirmText: string;
          onSubmit: (value: string) => Promise<void>;
      }
    | { kind: "picker"; mode: "move" | "copy"; ids: string[] }
    | null;

/** 字节数 → 人类可读（1 KB = 1024 B） */
function formatSize(bytes: number): string {
    if (!bytes) return "—";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let value = bytes;
    let i = 0;
    while (value >= 1024 && i < units.length - 1) {
        value /= 1024;
        i += 1;
    }
    return `${value >= 100 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

/** ISO 时间 → YYYY-MM-DD HH:MM */
function formatTime(iso?: string): string {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function isFolder(item: AdminFileItem): boolean {
    return item.type === 2;
}

/** 归到哪个文件类型分组（目录单独一组） */
function fileCategory(item: AdminFileItem): FileCategory {
    if (isFolder(item)) return "folder";
    const ext = item.name.split(".").pop()?.toLowerCase() ?? "";
    for (const key of ["image", "video", "audio", "archive", "code", "doc"] as const) {
        if (EXT_BY_CATEGORY[key].includes(ext)) return key;
    }
    return "other";
}

/** 按类型分组给图标与颜色 */
function fileIcon(item: AdminFileItem): { Icon: LucideIcon; cls: string } {
    switch (fileCategory(item)) {
        case "folder":
            return { Icon: Folder, cls: "text-amber-500" };
        case "image":
            return { Icon: FileImage, cls: "text-emerald-500" };
        case "video":
            return { Icon: FileVideo, cls: "text-purple-500" };
        case "audio":
            return { Icon: FileAudio, cls: "text-pink-500" };
        case "archive":
            return { Icon: FileArchive, cls: "text-orange-500" };
        case "code":
            return { Icon: FileCode, cls: "text-sky-500" };
        case "doc":
            return { Icon: FileText, cls: "text-blue-500" };
        default:
            return { Icon: File, cls: "text-muted-foreground" };
    }
}

/** 虚拟路径 → 面包屑（anzhiyu://my/a/b/ → [我的文件, a, b]，每级带可跳转 uri） */
function breadcrumbOf(uri: string): { label: string; uri: string }[] {
    const m = /^anzhiyu:\/\/([^/]*)\/(.*)$/.exec(uri.replace(/\/+$/, "") + "/");
    const rootLabel = m && m[1] && m[1] !== "my" ? m[1] : "我的文件";
    const rest = (m?.[2] ?? "").split("/").filter(Boolean);
    const base = `anzhiyu://${m?.[1] || "my"}/`;
    const items = [{ label: rootLabel, uri: base }];
    let acc = base;
    for (const seg of rest) {
        acc += `${seg}/`;
        items.push({ label: seg, uri: acc });
    }
    return items;
}

/** 目录 URI（补结尾斜杠）+ 新名称 → 新建用的完整 uri */
function joinUri(dirUri: string, name: string): string {
    return `${dirUri.replace(/\/+$/, "")}/${name}`;
}

/** 是否图片（可大图预览 / 有缩略图） */
function isImage(item: AdminFileItem): boolean {
    return fileCategory(item) === "image";
}

/**
 * 文件缩略图：后端不直接给地址，需先取签名（GET /thumbnail/:id，带缓存）再拼 `${API_URL}/t/:sign`。
 * 只有图片/视频才有缩略图；取不到（404 未生成 / 202 生成中 / 网络失败）就回退到类型图标。
 */
function FileThumb({ item, iconClassName }: { item: AdminFileItem; iconClassName: string }) {
    const [src, setSrc] = useState<string | null>(item.thumbnail_url || null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        if (src) return;
        const cat = fileCategory(item);
        if (cat !== "image" && cat !== "video") return; // 其它类型没有缩略图
        let cancelled = false;
        void (async () => {
            const sign = await getCachedThumbnailSignApi(item.id);
            if (!cancelled && sign) setSrc(adminThumbnailUrl(sign));
        })();
        return () => {
            cancelled = true;
        };
    }, [item, src]);

    const { Icon, cls } = fileIcon(item);
    if (src && !failed) {
        return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
                src={src}
                alt=""
                loading="lazy"
                className="size-full object-cover"
                onError={() => setFailed(true)}
            />
        );
    }
    return <Icon className={cn(iconClassName, cls)} />;
}

/**
 * 文件管理：官方 /admin/file-management 的版式（头部操作条 + 面包屑 + 网格/列表双视图 + 详情面板），
 * 数据与操作全部走后端真实接口（经同源代理）：
 *   列表 GET /file · 详情 GET /file/:id · 目录大小 GET /folder/size/:id · 下载 GET /file/download/:id
 *   新建 POST /file/create · 重命名 PUT /file/rename · 删除 DELETE /file · 移动/复制 POST /folder/move|copy
 */
export function FileManager({ initialUri = FILE_ROOT_URI }: { initialUri?: string }) {
    const [uri, setUri] = useState(initialUri);
    const [data, setData] = useState<AdminFileListData | null>(null);
    const [files, setFiles] = useState<AdminFileItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [moreLoading, setMoreLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [view, setView] = useState<ViewMode>("grid");
    const [searchOpen, setSearchOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [sortKey, setSortKey] = useState<SortKey>("name");
    const [sortAsc, setSortAsc] = useState(true);

    const [selected, setSelected] = useState<string[]>([]);
    const [detail, setDetail] = useState<AdminFileItem | null>(null);
    const [preview, setPreview] = useState<AdminFileItem | null>(null);
    const [detailInfo, setDetailInfo] = useState<AdminFileItem | null>(null);
    const [folderSize, setFolderSize] = useState<AdminFolderSize | null>(null);
    const [busy, setBusy] = useState(false);
    const [dialog, setDialog] = useState<DialogState>(null);

    /** 拉一页（next_token 为空时是首屏/刷新） */
    const load = useCallback(async (targetUri: string, nextToken?: string) => {
        const first = !nextToken;
        if (first) {
            setLoading(true);
            setError(null);
        } else {
            setMoreLoading(true);
        }
        try {
            const res = await getAdminFilesApi({ uri: targetUri, next_token: nextToken });
            setData(res);
            setFiles((prev) => {
                if (first) return res.files ?? [];
                const seen = new Set(prev.map((f) => f.id));
                return [...prev, ...(res.files ?? []).filter((f) => !seen.has(f.id))];
            });
        } catch (e) {
            const msg = e instanceof Error ? e.message : "加载失败";
            if (first) {
                setError(msg);
                setFiles([]);
            } else {
                toast.error(msg);
            }
        } finally {
            setLoading(false);
            setMoreLoading(false);
        }
    }, []);

    useEffect(() => {
        // 放到下一个 tick 再执行：effect 内同步 setState 会触发级联渲染（react-hooks/set-state-in-effect）
        const timer = setTimeout(() => {
            setDetail(null);
            setDetailInfo(null);
            setFolderSize(null);
            setSelected([]);
            setQuery("");
            void load(uri);
        }, 0);
        return () => clearTimeout(timer);
    }, [uri, load]);

    /** 详情：补拉文件信息；目录再拉一次大小统计 */
    useEffect(() => {
        if (!detail) return;
        let cancelled = false;
        (async () => {
            try {
                const info = await getAdminFileInfoApi(detail.id);
                if (!cancelled && info?.file) setDetailInfo(info.file);
            } catch {
                // 详情接口失败就用列表里的字段展示
            }
            if (isFolder(detail)) {
                try {
                    const size = await getAdminFolderSizeApi(detail.id);
                    if (!cancelled) setFolderSize(size);
                } catch {
                    // 目录大小拿不到就不显示
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [detail]);

    const breadcrumb = useMemo(() => breadcrumbOf(uri), [uri]);
    const nextToken = data?.pagination?.next_token || "";

    /** 当前目录下的条目：搜索过滤 + 排序（文件夹恒在最前；「类型」排序时按固定类型分组） */
    const visible = useMemo(() => {
        const kw = query.trim().toLowerCase();
        const list = kw ? files.filter((f) => f.name.toLowerCase().includes(kw)) : files;
        return [...list].sort((a, b) => {
            const ca = CATEGORY_ORDER.indexOf(fileCategory(a));
            const cb = CATEGORY_ORDER.indexOf(fileCategory(b));
            // 分组顺序固定：文件夹 → 图片 → 视频 → 音频 → 压缩包 → 代码 → 文档 → 其他
            if (ca !== cb) return ca - cb;
            let r = 0;
            // 「类型」排序时组内按名称，其余按所选字段
            if (sortKey === "size") r = a.size - b.size;
            else if (sortKey === "updated_at") r = new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
            else r = a.name.localeCompare(b.name, "zh-CN");
            return sortAsc ? r : -r;
        });
    }, [files, query, sortKey, sortAsc]);

    const selectedItems = useMemo(() => files.filter((f) => selected.includes(f.id)), [files, selected]);
    const selectedSingle = selectedItems.length === 1 ? selectedItems[0] : null;
    const allSelected = visible.length > 0 && visible.every((f) => selected.includes(f.id));

    const toggleSelect = (id: string) =>
        setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    const toggleSelectAll = () => setSelected(allSelected ? [] : visible.map((f) => f.id));

    const openItem = (item: AdminFileItem) => {
        if (isFolder(item)) {
            setUri(`${item.path.replace(/\/+$/, "")}/`);
            return;
        }
        setDetail(item);
    };

    const copyText = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            toast.success("已复制");
        } catch {
            toast.error("复制失败");
        }
    };

    /** 统一包装：期间禁用操作按钮，成功后刷新列表 */
    const run = async (task: () => Promise<unknown>, okText: string) => {
        setBusy(true);
        try {
            await task();
            toast.success(okText);
            setSelected([]);
            setDialog(null);
            await load(uri);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "操作失败");
        } finally {
            setBusy(false);
        }
    };

    const submitNew = (type: 1 | 2, name: string) =>
        run(
            () => createAdminFileApi({ uri: joinUri(uri, name), type, err_on_conflict: true }),
            type === 2 ? "文件夹已创建" : "文件已创建"
        );

    const submitRename = (item: AdminFileItem, name: string) => run(() => renameAdminFileApi(item.id, name), "已重命名");

    const submitDelete = (ids: string[]) => run(() => deleteAdminFilesApi(ids), `已删除 ${ids.length} 项`);

    const downloadItem = (item: AdminFileItem) => {
        if (isFolder(item)) {
            toast.info("文件夹暂不支持直接下载");
            return;
        }
        window.open(adminFileDownloadUrl(item.id), "_blank", "noopener");
    };

    /** 双击：图片开预览，其它文件直接下载 */
    const openItemSecondary = (item: AdminFileItem) => {
        if (isImage(item)) setPreview(item);
        else downloadItem(item);
    };

    // 预览层：Esc 关闭
    useEffect(() => {
        if (!preview) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setPreview(null);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [preview]);

    return (
        // admin-card：吃掉剩余高度；操作条 / 面包屑固定在卡片顶部，内容在 admin-scroll 内部滚动
        <div className="admin-card">
            {/* ===== 顶部操作条（固定在卡片顶部，不随内容滚动） ===== */}
            <div className="flex min-h-10 shrink-0 flex-wrap items-center justify-between gap-2 border-b p-3">
                <div className="flex flex-wrap items-center gap-2">
                    {/* 新建 / 重命名 / 删除 / 移动 / 复制：胶囊按钮组 */}
                    <div className="flex items-center overflow-hidden rounded-xl border bg-card shadow-sm">
                        <button
                            type="button"
                            title="新建文件夹"
                            aria-label="新建文件夹"
                            disabled={busy}
                            onClick={() =>
                                setDialog({
                                    kind: "prompt",
                                    title: "新建文件夹",
                                    placeholder: "文件夹名称",
                                    confirmText: "创建",
                                    onSubmit: (v) => submitNew(2, v),
                                })
                            }
                            className="flex size-9 items-center justify-center text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-50"
                        >
                            <FolderPlus className="size-4" />
                        </button>
                        <button
                            type="button"
                            title="新建空文件"
                            aria-label="新建空文件"
                            disabled={busy}
                            onClick={() =>
                                setDialog({
                                    kind: "prompt",
                                    title: "新建文件",
                                    placeholder: "文件名（含扩展名）",
                                    confirmText: "创建",
                                    onSubmit: (v) => submitNew(1, v),
                                })
                            }
                            className="flex size-9 items-center justify-center text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-50"
                        >
                            <FilePlus2 className="size-4" />
                        </button>
                        <span className="h-5 w-px bg-border" />
                        <button
                            type="button"
                            title="重命名（选中 1 项）"
                            aria-label="重命名"
                            disabled={busy || !selectedSingle}
                            onClick={() => {
                                if (!selectedSingle) return;
                                setDialog({
                                    kind: "prompt",
                                    title: "重命名",
                                    defaultValue: selectedSingle.name,
                                    confirmText: "保存",
                                    onSubmit: (v) => submitRename(selectedSingle, v),
                                });
                            }}
                            className="flex size-9 items-center justify-center text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-40"
                        >
                            <Pencil className="size-4" />
                        </button>
                        <button
                            type="button"
                            title="移动（选中项）"
                            aria-label="移动"
                            disabled={busy || selected.length === 0}
                            onClick={() => setDialog({ kind: "picker", mode: "move", ids: selected })}
                            className="flex size-9 items-center justify-center text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-40"
                        >
                            <Move className="size-4" />
                        </button>
                        <button
                            type="button"
                            title="复制（选中项）"
                            aria-label="复制"
                            disabled={busy || selected.length === 0}
                            onClick={() => setDialog({ kind: "picker", mode: "copy", ids: selected })}
                            className="flex size-9 items-center justify-center text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-40"
                        >
                            <Copy className="size-4" />
                        </button>
                        <button
                            type="button"
                            title="下载（选中 1 个文件）"
                            aria-label="下载"
                            disabled={busy || !selectedSingle || isFolder(selectedSingle)}
                            onClick={() => selectedSingle && downloadItem(selectedSingle)}
                            className="flex size-9 items-center justify-center text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-40"
                        >
                            <Download className="size-4" />
                        </button>
                        <span className="h-5 w-px bg-border" />
                        <button
                            type="button"
                            title="删除（选中项）"
                            aria-label="删除"
                            disabled={busy || selected.length === 0}
                            onClick={() => {
                                const ids = selected;
                                if (!window.confirm(`确定删除选中的 ${ids.length} 项吗？`)) return;
                                void submitDelete(ids);
                            }}
                            className="flex size-9 items-center justify-center text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-40"
                        >
                            <Trash2 className="size-4" />
                        </button>
                    </div>

                    {selected.length > 0 && (
                        <span className="text-xs text-muted-foreground">
                            已选中 <span className="font-medium text-foreground">{selected.length}</span> 项
                            <button
                                type="button"
                                onClick={() => setSelected([])}
                                className="ml-2 underline underline-offset-2 hover:text-foreground"
                            >
                                取消
                            </button>
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
                        <HardDrive className="size-3.5" />
                        共 {visible.length} 项{query ? `（筛选自 ${files.length} 项）` : ""}
                    </span>

                    {searchOpen ? (
                        <div className="relative">
                            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                autoFocus
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="搜索当前目录…"
                                className="h-9 w-40 pl-8 text-xs sm:w-56"
                            />
                            <button
                                type="button"
                                aria-label="关闭搜索"
                                onClick={() => {
                                    setQuery("");
                                    setSearchOpen(false);
                                }}
                                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
                            >
                                <X className="size-3.5" />
                            </button>
                        </div>
                    ) : (
                        <Button
                            variant="outline"
                            size="icon-sm"
                            aria-label="搜索"
                            title="搜索当前目录"
                            className="size-9 rounded-xl"
                            onClick={() => setSearchOpen(true)}
                        >
                            <Search className="size-4" />
                        </Button>
                    )}

                    <Button
                        variant="outline"
                        size="icon-sm"
                        aria-label="刷新"
                        title="刷新"
                        className="size-9 rounded-xl"
                        disabled={loading}
                        onClick={() => void load(uri)}
                    >
                        <RefreshCw className={cn("size-4", loading && "animate-spin")} />
                    </Button>

                    <div className="flex items-center overflow-hidden rounded-xl border bg-card shadow-sm">
                        <button
                            type="button"
                            aria-label="网格视图"
                            title="网格视图"
                            onClick={() => setView("grid")}
                            className={cn(
                                "flex size-9 items-center justify-center transition-colors",
                                view === "grid" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-primary"
                            )}
                        >
                            <LayoutGrid className="size-4" />
                        </button>
                        <button
                            type="button"
                            aria-label="列表视图"
                            title="列表视图"
                            onClick={() => setView("list")}
                            className={cn(
                                "flex size-9 items-center justify-center transition-colors",
                                view === "list" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-primary"
                            )}
                        >
                            <List className="size-4" />
                        </button>
                        <span className="h-5 w-px bg-border" />
                        <button
                            type="button"
                            aria-label="切换排序字段"
                            title="排序字段：名称 / 大小 / 修改时间 / 类型"
                            onClick={() =>
                                setSortKey((k) =>
                                    k === "name" ? "size" : k === "size" ? "updated_at" : k === "updated_at" ? "type" : "name"
                                )
                            }
                            className="flex h-9 items-center gap-1 px-2.5 text-xs text-muted-foreground transition-colors hover:text-primary"
                        >
                            {sortKey === "name" ? "名称" : sortKey === "size" ? "大小" : sortKey === "updated_at" ? "时间" : "类型"}
                        </button>
                        <button
                            type="button"
                            aria-label={sortAsc ? "改为降序" : "改为升序"}
                            title={sortAsc ? "升序（点击改降序）" : "降序（点击改升序）"}
                            onClick={() => setSortAsc((v) => !v)}
                            className="flex size-9 items-center justify-center text-muted-foreground transition-colors hover:text-primary"
                        >
                            {sortAsc ? <ArrowDownAZ className="size-4" /> : <ArrowUpAZ className="size-4" />}
                        </button>
                    </div>
                </div>
            </div>

            {/* ===== 面包屑（固定在卡片顶部，不随内容滚动） ===== */}
            <div className="flex shrink-0 flex-wrap items-center gap-1 border-b px-3 py-2 text-sm">
                {breadcrumb.map((item, idx) => (
                    <span key={item.uri} className="flex items-center gap-1">
                        {idx > 0 && <ChevronRight className="size-3.5 text-muted-foreground" />}
                        <button
                            type="button"
                            onClick={() => setUri(item.uri)}
                            disabled={idx === breadcrumb.length - 1}
                            className={cn(
                                "rounded-md px-1.5 py-0.5 transition-colors",
                                idx === breadcrumb.length - 1
                                    ? "font-medium text-foreground"
                                    : "text-muted-foreground hover:bg-muted hover:text-primary"
                            )}
                        >
                            {item.label}
                        </button>
                    </span>
                ))}
            </div>

            {/* ===== 内容区（唯一的滚动区：网格视图 / 列表视图共用同一个 admin-scroll） ===== */}
            <div className="admin-scroll">
                {loading ? (
                    <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground">
                        <Loader2 className="mr-2 size-4 animate-spin" />
                        加载中…
                    </div>
                ) : error ? (
                    <div className="flex min-h-64 flex-col items-center justify-center gap-2 text-sm">
                        <p className="text-destructive">{error}</p>
                        <Button variant="outline" size="sm" onClick={() => void load(uri)}>
                            重试
                        </Button>
                    </div>
                ) : visible.length === 0 ? (
                    <div className="flex min-h-64 flex-col items-center justify-center gap-1 text-sm text-muted-foreground">
                        <Folder className="size-8 opacity-40" />
                        {query ? "没有匹配的文件" : "这个目录是空的"}
                    </div>
                ) : view === "grid" ? (
                    <div className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                        {visible.map((item) => {
                            const checked = selected.includes(item.id);
                            return (
                                <div
                                    key={item.id}
                                    className={cn(
                                        "group relative rounded-xl border bg-card p-3 text-center shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary hover:shadow-md",
                                        checked && "border-primary ring-1 ring-primary/30",
                                        detail?.id === item.id && !checked && "border-primary/60"
                                    )}
                                >
                                    <span className="absolute left-2 top-2 z-10">
                                        <Checkbox
                                            checked={checked}
                                            onCheckedChange={() => toggleSelect(item.id)}
                                            aria-label={`选择 ${item.name}`}
                                        />
                                    </span>
                                    {isImage(item) && (
                                        <button
                                            type="button"
                                            aria-label={`预览 ${item.name}`}
                                            title="预览"
                                            onClick={() => setPreview(item)}
                                            className="absolute right-2 top-2 z-10 rounded-md border bg-card/90 p-1 text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-primary focus:opacity-100 group-hover:opacity-100"
                                        >
                                            <Eye className="size-3.5" />
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => openItem(item)}
                                        onDoubleClick={() => openItemSecondary(item)}
                                        title={item.name}
                                        className="flex w-full flex-col items-center gap-2"
                                    >
                                        <span className="mt-4 flex size-12 items-center justify-center overflow-hidden rounded-xl bg-muted">
                                            <FileThumb item={item} iconClassName="size-6" />
                                        </span>
                                        <span className="line-clamp-2 w-full break-all text-xs font-medium leading-tight">
                                            {item.name}
                                        </span>
                                        <span className="text-[10px] text-muted-foreground">
                                            {isFolder(item) ? "文件夹" : formatSize(item.size)} · {formatTime(item.updated_at)}
                                        </span>
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    // 列表视图：表头吸顶；整个列表与网格视图共用外层 admin-scroll，这里不再自带滚动/边框
                    <div>
                        <div className="admin-sticky-head hidden min-w-[800px] grid-cols-[28px_1fr_80px_100px_150px_110px] items-center gap-3 border-b px-4 py-2.5 text-xs font-medium text-muted-foreground sm:grid">
                            <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} aria-label="全选" />
                            <span>名称</span>
                            <span>类型</span>
                            <span className="text-right">大小</span>
                            <span>修改时间</span>
                            <span className="text-right">操作</span>
                        </div>
                        <div className="sm:min-w-[800px]">
                            {visible.map((item) => {
                                const checked = selected.includes(item.id);
                                return (
                                    <div
                                        key={item.id}
                                        className={cn(
                                            "grid grid-cols-1 items-center gap-x-3 gap-y-1 border-b px-4 py-2.5 text-sm transition-colors last:border-b-0 hover:bg-muted/40 sm:grid-cols-[28px_1fr_80px_100px_150px_110px]",
                                            checked && "bg-primary/5"
                                        )}
                                    >
                                        <Checkbox
                                            checked={checked}
                                            onCheckedChange={() => toggleSelect(item.id)}
                                            aria-label={`选择 ${item.name}`}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => openItem(item)}
                                            className="flex min-w-0 items-center gap-2 pl-6 text-left sm:pl-0"
                                            title={item.name}
                                        >
                                            <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
                                                <FileThumb item={item} iconClassName="size-4" />
                                            </span>
                                            <span className="truncate font-medium">{item.name}</span>
                                        </button>
                                        <span className="pl-10 text-xs text-muted-foreground sm:pl-0">
                                            {CATEGORY_LABEL[fileCategory(item)]}
                                        </span>
                                        <span className="pl-10 text-xs text-muted-foreground sm:pl-0 sm:text-right">
                                            {isFolder(item) ? "—" : formatSize(item.size)}
                                        </span>
                                        <span className="pl-10 text-xs text-muted-foreground sm:pl-0">
                                            {formatTime(item.updated_at)}
                                        </span>
                                        <span className="flex justify-end gap-0.5">
                                            {isImage(item) && (
                                                <Button
                                                    variant="ghost"
                                                    size="icon-sm"
                                                    aria-label="预览"
                                                    title="预览"
                                                    onClick={() => setPreview(item)}
                                                >
                                                    <Eye className="size-3.5" />
                                                </Button>
                                            )}
                                            {!isFolder(item) && (
                                                <Button
                                                    variant="ghost"
                                                    size="icon-sm"
                                                    aria-label="下载"
                                                    title="下载"
                                                    onClick={() => downloadItem(item)}
                                                >
                                                    <Download className="size-3.5" />
                                                </Button>
                                            )}
                                            <Button
                                                variant="ghost"
                                                size="icon-sm"
                                                aria-label="重命名"
                                                title="重命名"
                                                onClick={() =>
                                                    setDialog({
                                                        kind: "prompt",
                                                        title: "重命名",
                                                        defaultValue: item.name,
                                                        confirmText: "保存",
                                                        onSubmit: (v) => submitRename(item, v),
                                                    })
                                                }
                                            >
                                                <Pencil className="size-3.5" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon-sm"
                                                aria-label="删除"
                                                title="删除"
                                                className="text-destructive hover:text-destructive"
                                                onClick={() => {
                                                    if (!window.confirm(`确定删除「${item.name}」吗？`)) return;
                                                    void submitDelete([item.id]);
                                                }}
                                            >
                                                <Trash2 className="size-3.5" />
                                            </Button>
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {!loading && !error && nextToken && (
                    <div className="flex justify-center p-3">
                        <Button variant="outline" size="sm" disabled={moreLoading} onClick={() => void load(uri, nextToken)}>
                            {moreLoading ? <Loader2 className="size-3.5 animate-spin" /> : null}
                            加载更多
                        </Button>
                    </div>
                )}
            </div>

            {/* ===== 详情面板（固定在卡片底部，不随列表滚动） ===== */}
            {detail && (
                <div className="shrink-0 border-t p-4">
                    <div className="mb-3 flex items-center justify-between gap-2">
                        <h3 className="truncate text-sm font-semibold" title={detail.name}>
                            {detail.name}
                        </h3>
                        <div className="flex items-center gap-1">
                            {isImage(detail) && (
                                <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setPreview(detail)}>
                                    <Eye className="size-3.5" />
                                    预览
                                </Button>
                            )}
                            {!isFolder(detail) && (
                                <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => downloadItem(detail)}>
                                    <Download className="size-3.5" />
                                    下载
                                </Button>
                            )}
                            <button
                                type="button"
                                aria-label="关闭详情"
                                onClick={() => setDetail(null)}
                                className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            >
                                <X className="size-4" />
                            </button>
                        </div>
                    </div>
                    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
                        <div className="flex justify-between gap-3 border-b py-1.5">
                            <dt className="text-muted-foreground">类型</dt>
                            <dd>{isFolder(detail) ? "文件夹" : "文件"}</dd>
                        </div>
                        <div className="flex justify-between gap-3 border-b py-1.5">
                            <dt className="text-muted-foreground">大小</dt>
                            <dd>
                                {isFolder(detail) ? "—" : formatSize(detailInfo?.size ?? detail.size)}
                            </dd>
                        </div>
                        {isFolder(detail) && folderSize && (
                            <>
                                <div className="flex justify-between gap-3 border-b py-1.5">
                                    <dt className="text-muted-foreground">逻辑大小</dt>
                                    <dd>{formatSize(folderSize.logicalSize)}</dd>
                                </div>
                                <div className="flex justify-between gap-3 border-b py-1.5">
                                    <dt className="text-muted-foreground">占用空间 / 文件数</dt>
                                    <dd>
                                        {formatSize(folderSize.storageConsumption)} · {folderSize.fileCount} 个
                                    </dd>
                                </div>
                            </>
                        )}
                        <div className="flex justify-between gap-3 border-b py-1.5">
                            <dt className="text-muted-foreground">创建时间</dt>
                            <dd>{formatTime(detailInfo?.created_at ?? detail.created_at)}</dd>
                        </div>
                        <div className="flex justify-between gap-3 border-b py-1.5">
                            <dt className="text-muted-foreground">修改时间</dt>
                            <dd>{formatTime(detailInfo?.updated_at ?? detail.updated_at)}</dd>
                        </div>
                        <div className="flex justify-between gap-3 border-b py-1.5 sm:col-span-2">
                            <dt className="shrink-0 text-muted-foreground">路径</dt>
                            <dd className="truncate text-right" title={detailInfo?.path ?? detail.path}>
                                {detailInfo?.path ?? detail.path}
                            </dd>
                        </div>
                        {(detailInfo?.url || detail.url) && (
                            <div className="flex items-center justify-between gap-3 border-b py-1.5 sm:col-span-2">
                                <dt className="shrink-0 text-muted-foreground">直链</dt>
                                <dd className="flex min-w-0 items-center gap-1">
                                    <a
                                        href={detailInfo?.url ?? detail.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="truncate text-primary hover:underline"
                                        title={detailInfo?.url ?? detail.url}
                                    >
                                        {detailInfo?.url ?? detail.url}
                                    </a>
                                    <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        aria-label="复制直链"
                                        title="复制直链"
                                        onClick={() => void copyText((detailInfo?.url ?? detail.url) as string)}
                                    >
                                        <Copy className="size-3.5" />
                                    </Button>
                                </dd>
                            </div>
                        )}
                    </dl>
                </div>
            )}

            {/* ===== 图片预览层 ===== */}
            {preview && (
                <div
                    className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/75 p-4"
                    onMouseDown={() => setPreview(null)}
                >
                    <div className="flex max-h-full max-w-full items-center justify-center" onMouseDown={(e) => e.stopPropagation()}>
                        {/* 原图走同源下载代理（自动带 cookie）；加载失败会显示空框，可直接点下载 */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={adminFileDownloadUrl(preview.id)}
                            alt={preview.name}
                            className="max-h-[78vh] max-w-full rounded-lg object-contain shadow-2xl"
                        />
                    </div>
                    <div
                        className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-white/90"
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        <span className="max-w-[60vw] truncate" title={preview.name}>
                            {preview.name}
                        </span>
                        <span className="text-white/60">{formatSize(preview.size)}</span>
                        <a
                            href={adminFileDownloadUrl(preview.id)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline underline-offset-2 hover:text-white"
                        >
                            下载原图
                        </a>
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

            {/* ===== 对话框 ===== */}
            {dialog?.kind === "prompt" && (
                <PromptDialog
                    title={dialog.title}
                    placeholder={dialog.placeholder}
                    defaultValue={dialog.defaultValue}
                    confirmText={dialog.confirmText}
                    busy={busy}
                    onCancel={() => setDialog(null)}
                    onSubmit={(v) => void dialog.onSubmit(v)}
                />
            )}
            {dialog?.kind === "picker" && (
                <FolderPickerDialog
                    mode={dialog.mode}
                    count={dialog.ids.length}
                    rootUri={FILE_ROOT_URI}
                    currentUri={uri}
                    busy={busy}
                    onCancel={() => setDialog(null)}
                    onConfirm={(destinationID, destinationLabel) =>
                        void run(
                            () =>
                                dialog.mode === "move"
                                    ? moveAdminFilesApi(dialog.ids, destinationID)
                                    : copyAdminFilesApi(dialog.ids, destinationID),
                            dialog.mode === "move" ? `已移动到 ${destinationLabel}` : `已复制到 ${destinationLabel}`
                        )
                    }
                />
            )}
        </div>
    );
}

/** 输入框对话框（新建 / 重命名） */
function PromptDialog({
    title,
    placeholder,
    defaultValue,
    confirmText,
    busy,
    onSubmit,
    onCancel,
}: {
    title: string;
    placeholder?: string;
    defaultValue?: string;
    confirmText: string;
    busy: boolean;
    onSubmit: (value: string) => void;
    onCancel: () => void;
}) {
    const [value, setValue] = useState(defaultValue ?? "");
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={onCancel}>
            <div
                className="w-full max-w-sm rounded-xl border bg-card p-5 shadow-xl"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <h3 className="mb-3 text-base font-semibold">{title}</h3>
                <Input
                    autoFocus
                    value={value}
                    placeholder={placeholder}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && value.trim()) onSubmit(value.trim());
                    }}
                />
                <div className="mt-4 flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={onCancel}>
                        取消
                    </Button>
                    <Button size="sm" disabled={busy || !value.trim()} onClick={() => onSubmit(value.trim())}>
                        {confirmText}
                    </Button>
                </div>
            </div>
        </div>
    );
}

/** 目录选择对话框（移动 / 复制）：用列表接口逐级浏览，点「选此目录」确定目标 */
function FolderPickerDialog({
    mode,
    count,
    rootUri,
    currentUri,
    busy,
    onConfirm,
    onCancel,
}: {
    mode: "move" | "copy";
    count: number;
    rootUri: string;
    currentUri: string;
    busy: boolean;
    onConfirm: (destinationID: string, destinationLabel: string) => void;
    onCancel: () => void;
}) {
    const [pickerUri, setPickerUri] = useState(rootUri);
    const [folders, setFolders] = useState<AdminFileItem[]>([]);
    // 后端 ListResponse.parent 是**当前目录本身**（不是上级目录），移动/复制的目标 ID 就用它
    const [currentDir, setCurrentDir] = useState<AdminFileItem | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        // 延后到下一个 tick：effect 内同步 setState 会触发级联渲染（react-hooks/set-state-in-effect）
        const timer = setTimeout(() => {
            setLoading(true);
            void (async () => {
                try {
                    const res = await getAdminFilesApi({ uri: pickerUri });
                    if (cancelled) return;
                    setFolders((res.files ?? []).filter((f) => isFolder(f)));
                    setCurrentDir(res.parent ?? null);
                } catch (e) {
                    if (!cancelled) toast.error(e instanceof Error ? e.message : "目录加载失败");
                } finally {
                    if (!cancelled) setLoading(false);
                }
            })();
        }, 0);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [pickerUri]);

    const crumb = breadcrumbOf(pickerUri);
    const targetLabel = crumb[crumb.length - 1]?.label ?? "我的文件";
    const isCurrentDir = pickerUri === currentUri;
    /** 上一级（用面包屑推导，不依赖 parent 的语义） */
    const upUri = crumb.length >= 2 ? crumb[crumb.length - 2].uri : null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={onCancel}>
            <div
                className="flex max-h-[80vh] w-full max-w-md flex-col rounded-xl border bg-card p-5 shadow-xl"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <h3 className="mb-1 text-base font-semibold">{mode === "move" ? "移动到" : "复制到"}</h3>
                <p className="mb-3 text-xs text-muted-foreground">
                    已选中 {count} 项，目标目录：<span className="font-medium text-foreground">{targetLabel}</span>
                </p>

                <div className="flex flex-wrap items-center gap-1 rounded-lg border px-2 py-1.5 text-xs">
                    {crumb.map((c, i) => (
                        <span key={c.uri} className="flex items-center gap-1">
                            {i > 0 && <ChevronRight className="size-3 text-muted-foreground" />}
                            <button
                                type="button"
                                onClick={() => setPickerUri(c.uri)}
                                disabled={i === crumb.length - 1}
                                className={cn(
                                    "rounded px-1 py-0.5",
                                    i === crumb.length - 1 ? "font-medium" : "text-muted-foreground hover:text-primary"
                                )}
                            >
                                {c.label}
                            </button>
                        </span>
                    ))}
                </div>

                <div className="mt-2 min-h-40 flex-1 overflow-y-auto rounded-lg border">
                    {loading ? (
                        <div className="flex h-40 items-center justify-center text-xs text-muted-foreground">
                            <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                            加载中…
                        </div>
                    ) : (
                        <>
                            {upUri && (
                                <button
                                    type="button"
                                    onClick={() => setPickerUri(upUri)}
                                    className="flex w-full items-center gap-2 border-b px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted"
                                >
                                    <Folder className="size-4 text-amber-500" />
                                    返回上级
                                </button>
                            )}
                            {folders.length === 0 && !upUri && (
                                <p className="px-3 py-6 text-center text-xs text-muted-foreground">这里没有子文件夹</p>
                            )}
                            {folders.map((f) => (
                                <button
                                    key={f.id}
                                    type="button"
                                    onClick={() => setPickerUri(`${f.path.replace(/\/+$/, "")}/`)}
                                    className="flex w-full items-center gap-2 border-b px-3 py-2 text-left text-sm transition-colors last:border-b-0 hover:bg-muted"
                                >
                                    <Folder className="size-4 text-amber-500" />
                                    <span className="truncate">{f.name}</span>
                                    <ChevronRight className="ml-auto size-3.5 text-muted-foreground" />
                                </button>
                            ))}
                        </>
                    )}
                </div>

                <div className="mt-4 flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={onCancel}>
                        取消
                    </Button>
                    <Button
                        size="sm"
                        disabled={busy || !currentDir || isCurrentDir}
                        title={!currentDir ? "无法确定目标目录" : isCurrentDir ? "已是当前目录" : undefined}
                        onClick={() => currentDir && onConfirm(currentDir.id, targetLabel)}
                    >
                        {mode === "move" ? "移动到这里" : "复制到这里"}
                    </Button>
                </div>
            </div>
        </div>
    );
}
