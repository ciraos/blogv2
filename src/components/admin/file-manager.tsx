"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
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
    ImageOff,
    Info,
    LayoutGrid,
    Link2,
    List,
    Loader2,
    Move,
    Pencil,
    RefreshCw,
    Search,
    Share2,
    Trash2,
    Upload,
    X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
// 右键菜单直接用项目已有依赖 radix-ui 里内置的 ContextMenu 原语（ui/dropdown-menu 用的是同一套包），
// 因此**没有新增任何依赖**；只是不额外新建 ui/ 组件文件，把封装留在这个组件内部。
import { ContextMenu as ContextMenuPrimitive } from "radix-ui";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/confirm-provider";
import { Input } from "@/components/ui/input";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import {
    FILE_ROOT_URI,
    adminFileDownloadUrl,
    adminFilePreviewUrl,
    adminThumbnailUrl,
    copyAdminFilesApi,
    createAdminDirectLinkApi,
    createAdminFileApi,
    deleteAdminFilesApi,
    getAdminFileInfoApi,
    getAdminFilesApi,
    getAdminFolderSizeApi,
    getCachedThumbnailSignApi,
    moveAdminFilesApi,
    renameAdminFileApi,
    toAbsoluteApiUrl,
} from "@/lib/api";
import type { AdminFileItem, AdminFileListData, AdminFolderSize } from "@/lib/api";
import {
    uploadFilesToFileManager,
    type FileUploadProgress,
    type UploadFilesOutcome,
} from "@/lib/api-file-upload";
import { cn, resolveAssetUrl } from "@/lib/utils";

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
    image: [
        "png", "jpg", "jpeg", "jfif", "gif", "webp", "avif", "svg", "bmp", "ico",
        "tif", "tiff", "heic", "heif", "apng", "jxl",
    ],
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

/**
 * 扩展名判不出来时的兜底：后端若在 metadata 里带了 MIME（字段名不统一，有哪个用哪个），
 * 就能把没扩展名 / 冷门扩展名的图片也认出来（决定缩略图 + 能否预览）。
 */
function mimeCategory(item: AdminFileItem): FileCategory | null {
    const meta = item.metadata ?? {};
    const mime = (meta.mime || meta.mimetype || meta.content_type || meta["content-type"] || "").toLowerCase();
    if (!mime) return null;
    if (mime.startsWith("image/")) return "image";
    if (mime.startsWith("video/")) return "video";
    if (mime.startsWith("audio/")) return "audio";
    if (/(json|javascript|ecmascript|xml|yaml|html|css|x-sh|php)/.test(mime)) return "code";
    if (mime.startsWith("text/") || mime.includes("pdf")) return "doc";
    if (/(zip|rar|7z|tar|gzip|x-bzip)/.test(mime)) return "archive";
    return null;
}

/** 归到哪个文件类型分组（目录单独一组；先看扩展名，认不出再看 MIME） */
function fileCategory(item: AdminFileItem): FileCategory {
    if (isFolder(item)) return "folder";
    const ext = item.name.split(".").pop()?.toLowerCase() ?? "";
    for (const key of ["image", "video", "audio", "archive", "code", "doc"] as const) {
        if (EXT_BY_CATEGORY[key].includes(ext)) return key;
    }
    return mimeCategory(item) ?? "other";
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

/** 写剪贴板（失败不抛，交给调用方决定提示）；http://localhost 属安全上下文，clipboard 可用 */
async function writeClipboard(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
}

/**
 * 右键菜单项的样式：与 `src/components/ui/dropdown-menu.tsx` 的 DropdownMenuItem 保持一致，
 * 这样新菜单不会显得和项目里其它浮层不是一套。
 */
const MENU_ITEM_CLASS =
    "relative flex cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-hidden focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";

/** 右键菜单容器样式（对齐 DropdownMenuContent；变量名是 radix 为 context-menu 单独暴露的） */
const MENU_CONTENT_CLASS =
    "z-50 max-h-(--radix-context-menu-content-available-height) min-w-48 origin-(--radix-context-menu-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95";

/**
 * 文件缩略图。地址按**优先级逐级回退**，只要能出图就绝不停在通用图标上：
 *   1. 后端直接给的 `thumbnail_url`（最省流量，后端已经生成好的小图）
 *   2. 缩略图签名地址 `${API_URL}/t/:sign`（GET /thumbnail/:id 拿签名，带进程内缓存）
 *   3. **原图**（仅图片类）：同源下载代理 `/api/admin/file/download/:id` 直接当小图用
 *      —— 后端没有 avif 等格式的缩略图时，也能在列表里「一眼看出是什么图」；代价是整张下载
 *   4. 以上都失败（404 / 生成中 / 浏览器不支持该格式，如 heic）→ 回退到类型图标，绝不出现破图
 *
 * 非图片（pdf / zip / 代码…）不会去拉原图，只有图片/视频才会尝试 1、2，只有图片才会尝试 3。
 * 缩略图一律 `loading="lazy"` + `decoding="async"`，避免一屏几十张原图把带宽打爆。
 */
function FileThumb({ item, iconClassName }: { item: AdminFileItem; iconClassName: string }) {
    const cat = fileCategory(item);
    /** 后端直接给的缩略图地址（相对路径补站点前缀） */
    const direct = resolveAssetUrl(item.thumbnail_url);
    const [sign, setSign] = useState<string | null>(null);
    /** 签名那条链路是否已经有结论（没结论前不要急着落原图，免得图标一闪再出图） */
    const [signSettled, setSignSettled] = useState(false);
    /** 已经加载失败、要跳过的地址 */
    const [broken, setBroken] = useState<string[]>([]);

    const directBroken = !!direct && broken.includes(direct);
    const shouldAskSign = (cat === "image" || cat === "video") && (!direct || directBroken);

    useEffect(() => {
        if (!shouldAskSign || signSettled) return;
        let cancelled = false;
        void (async () => {
            const s = await getCachedThumbnailSignApi(item.id);
            if (cancelled) return;
            setSign(s);
            setSignSettled(true);
        })();
        return () => {
            cancelled = true;
        };
    }, [shouldAskSign, signSettled, item.id]);

    const candidates = useMemo(() => {
        const list: string[] = [];
        if (direct) list.push(direct);
        if (sign) list.push(adminThumbnailUrl(sign));
        // 只有图片才用原图兜底；非图片不去拉原图
        if (cat === "image" && signSettled) list.push(adminFilePreviewUrl(item.id));
        return list;
    }, [direct, sign, cat, signSettled, item.id]);

    // 取第一个还没失败的候选；全挂了就是 null → 图标
    const src = candidates.find((c) => !broken.includes(c)) ?? null;
    const { Icon, cls } = fileIcon(item);

    if (src) {
        return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
                src={src}
                alt=""
                loading="lazy"
                decoding="async"
                className="size-full object-cover"
                onError={() => setBroken((prev) => (prev.includes(src) ? prev : [...prev, src]))}
            />
        );
    }
    return <Icon className={cn(iconClassName, cls)} />;
}

/**
 * 图片预览弹窗（点图片文件名/缩略图打开）：大图居中 + 文件名/大小 + 详情/下载/关闭。
 * 与 PromptDialog / FolderPickerDialog 同一套弹窗写法（本项目没有 Dialog 组件）：
 * 点击遮罩关闭、Esc 关闭、关闭按钮带 aria-label。加载失败给明确提示，不留白屏。
 */
function ImagePreviewDialog({
    item,
    onClose,
    onOpenDetail,
}: {
    item: AdminFileItem;
    onClose: () => void;
    onOpenDetail: () => void;
}) {
    const [loaded, setLoaded] = useState(false);
    const [failed, setFailed] = useState(false);
    const src = adminFilePreviewUrl(item.id);

    // Esc 关闭
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label={`预览 ${item.name}`}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/75 p-4"
            onMouseDown={onClose}
        >
            <div
                className="relative flex max-h-full w-full max-w-full items-center justify-center"
                onMouseDown={(e) => e.stopPropagation()}
            >
                {failed ? (
                    <div className="flex max-w-sm flex-col items-center gap-2 rounded-xl border bg-card px-6 py-5 text-center">
                        <ImageOff className="size-6 text-destructive" />
                        <p className="text-sm font-medium">图片加载失败</p>
                        <p className="text-xs text-muted-foreground">
                            可能是格式不受支持、文件已损坏或没有读取权限，可打下面链接下载原图后再看。
                        </p>
                        <a
                            href={src}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary underline underline-offset-2"
                        >
                            下载原图
                        </a>
                    </div>
                ) : (
                    <>
                        {!loaded && <Loader2 className="absolute size-6 animate-spin text-white/70" />}
                        {/* 原图走同源下载代理（自动带 cookie），不需要额外签名 */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={src}
                            alt={item.name}
                            onLoad={() => setLoaded(true)}
                            onError={() => setFailed(true)}
                            className={cn(
                                "max-h-[80vh] max-w-full rounded-lg object-contain shadow-2xl transition-opacity",
                                !loaded && "opacity-0"
                            )}
                        />
                    </>
                )}
            </div>
            <div
                className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-white/90"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <span className="max-w-[60vw] truncate font-medium" title={item.name}>
                    {item.name}
                </span>
                <span className="text-white/60">{formatSize(item.size)}</span>
                <button
                    type="button"
                    onClick={onOpenDetail}
                    className="rounded border border-white/30 px-2 py-0.5 transition-colors hover:bg-white/10"
                >
                    查看详情
                </button>
                <a
                    href={src}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2 hover:text-white"
                >
                    下载原图
                </a>
                <button
                    type="button"
                    autoFocus
                    aria-label="关闭预览"
                    onClick={onClose}
                    className="rounded border border-white/30 px-2 py-0.5 transition-colors hover:bg-white/10"
                >
                    关闭（Esc）
                </button>
            </div>
        </div>
    );
}

/** 右键菜单里每一项要触发的动作（由 FileManager 提供，菜单本身只管排版 / 禁用态） */
interface ItemMenuActions {
    rename: () => void;
    move: () => void;
    download: () => void;
    share: () => void;
    directLink: () => void;
    copy: () => void;
    detail: () => void;
    remove: () => void;
}

/**
 * 条目右键菜单（网格视图的卡片 / 列表视图的行共用）。
 *
 * 实现要点：
 *  - **没有新增依赖**：用的是 radix-ui 里内置的 ContextMenu 原语（`ui/dropdown-menu.tsx` 用的是同一个包）。
 *  - 菜单位置：右键点坐标就是 radix 的虚拟锚点，`side="bottom"` 默认落在光标右下 2px；
 *    靠近视口右/下边缘时 popper 会自动翻转 + 收缩（avoidCollisions），不会溢出屏幕。
 *  - 关闭：Esc / 点击菜单外 / 选中任一项（radix 内置）；role=menu、role=menuitem、方向键、
 *    Home/End、typeahead 也全部由 radix 提供。
 *  - 触摸屏没有右键：radix 内置「长按 700ms」打开菜单（pointerdown 起计时，移动/抬起取消）。
 *
 * 菜单项对齐官方截图：重命名 / 移动到 / 下载 / 分享 / 获取直链 / 复制 / 详细信息 / ─── / 删除。
 * 文件夹没有「下载」「获取直链」的后端能力（后端直链只针对单个文件，也没有目录打包下载），
 * 这两项对文件夹置灰并标注「仅文件」，避免点了完全没反应。
 */
function ItemContextMenu({
    item,
    actions,
    children,
}: {
    item: AdminFileItem;
    actions: ItemMenuActions;
    children: ReactNode;
}) {
    const folder = isFolder(item);
    return (
        <ContextMenuPrimitive.Root>
            <ContextMenuPrimitive.Trigger asChild>{children}</ContextMenuPrimitive.Trigger>
            <ContextMenuPrimitive.Portal>
                {/* 注意：radix 的 ContextMenu 是按鼠标坐标定位的，Content 上**没有** side/align/sideOffset
                    这些 props（那是 DropdownMenu 的）；写了运行时不报错但 tsc 会失败。 */}
                <ContextMenuPrimitive.Content
                    className={MENU_CONTENT_CLASS}
                    aria-label={`${item.name} 的操作菜单`}
                >
                    <ContextMenuPrimitive.Item className={MENU_ITEM_CLASS} onSelect={actions.rename}>
                        <Pencil />
                        重命名
                    </ContextMenuPrimitive.Item>
                    <ContextMenuPrimitive.Item className={MENU_ITEM_CLASS} onSelect={actions.move}>
                        <Move />
                        移动到
                    </ContextMenuPrimitive.Item>
                    <ContextMenuPrimitive.Item
                        className={MENU_ITEM_CLASS}
                        disabled={folder}
                        onSelect={actions.download}
                    >
                        <Download />
                        下载
                        {folder && <span className="ml-auto text-[10px] text-muted-foreground">仅文件</span>}
                    </ContextMenuPrimitive.Item>
                    <ContextMenuPrimitive.Item className={MENU_ITEM_CLASS} onSelect={actions.share}>
                        <Share2 />
                        分享
                    </ContextMenuPrimitive.Item>
                    <ContextMenuPrimitive.Item
                        className={MENU_ITEM_CLASS}
                        disabled={folder}
                        onSelect={actions.directLink}
                    >
                        <Link2 />
                        获取直链
                        {folder && <span className="ml-auto text-[10px] text-muted-foreground">仅文件</span>}
                    </ContextMenuPrimitive.Item>
                    <ContextMenuPrimitive.Item className={MENU_ITEM_CLASS} onSelect={actions.copy}>
                        <Copy />
                        复制
                    </ContextMenuPrimitive.Item>
                    <ContextMenuPrimitive.Item className={MENU_ITEM_CLASS} onSelect={actions.detail}>
                        <Info />
                        详细信息
                    </ContextMenuPrimitive.Item>
                    {/* 危险项与其它项之间隔一条线（与截图 / ui/dropdown-menu 的分隔线同款） */}
                    <ContextMenuPrimitive.Separator className="-mx-1 my-1 h-px bg-border" />
                    <ContextMenuPrimitive.Item
                        className={cn(
                            MENU_ITEM_CLASS,
                            "text-destructive focus:bg-destructive/10 focus:text-destructive [&_svg]:text-destructive"
                        )}
                        onSelect={actions.remove}
                    >
                        <Trash2 />
                        删除
                    </ContextMenuPrimitive.Item>
                </ContextMenuPrimitive.Content>
            </ContextMenuPrimitive.Portal>
        </ContextMenuPrimitive.Root>
    );
}

/**
 * 文件管理：官方 /admin/file-management 的版式（头部操作条 + 面包屑 + 网格/列表双视图 + 详情抽屉），
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

    /**
     * 上传相关状态：
     *  - uploadFile：当前正在传的文件（null = 空闲），用来在按钮上出 loading
     *  - uploadProgress：当前文件的分片进度（已传 x / 共 y 片）
     *  - dragActive：文件被拖到列表区上方时给高亮遮罩用
     *  - abortRef：保存本次批量上传的 AbortController，供「取消」使用
     */
    const [uploadFile, setUploadFile] = useState<File | null>(null);
    const [uploadProgress, setUploadProgress] = useState<FileUploadProgress | null>(null);
    const [dragActive, setDragActive] = useState(false);
    const abortRef = useRef<AbortController | null>(null);
    /** 工具条的「上传」按钮只负责点开这个隐藏的 <input type="file" multiple> */
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    /** dragenter/dragleave 会在子元素之间反复触发，用计数器判断是否真的离开了列表区 */
    const dragDepthRef = useRef(0);

    /** 最后一次单击的条目 id：Shift 范围选要用它当锚点 */
    const lastClickedRef = useRef<string | null>(null);

    // 应用内确认弹窗（替代 window.confirm，见 components/confirm-provider.tsx）
    const confirm = useConfirm();

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

    /**
     * 单击条目 = **只做选中**（文件与文件夹一视同仁，单击不会进目录、也不会弹面板）：
     *  - 普通单击：单选（把选中态换成这一条）
     *  - Ctrl / Cmd + 单击：切换这一条的多选（勾选/取消）
     *  - Shift + 单击：从上次点击的条目到这一条做范围选
     * 卡片上的勾选框已经按需求去掉，所以多选靠这三种点击方式 + 工具条的「全选」。
     */
    const openItem = (item: AdminFileItem, e?: React.MouseEvent) => {
        if (e?.shiftKey && lastClickedRef.current) {
            const from = visible.findIndex((x) => x.id === lastClickedRef.current);
            const to = visible.findIndex((x) => x.id === item.id);
            if (from >= 0 && to >= 0) {
                const [start, end] = from <= to ? [from, to] : [to, from];
                const range = visible.slice(start, end + 1).map((x) => x.id);
                setSelected((prev) => Array.from(new Set([...prev, ...range])));
                return;
            }
        }
        if (e?.ctrlKey || e?.metaKey) {
            toggleSelect(item.id);
            lastClickedRef.current = item.id;
            return;
        }
        setSelected([item.id]);
        lastClickedRef.current = item.id;
    };

    const copyText = async (text: string, okText = "已复制") => {
        if (await writeClipboard(text)) toast.success(okText);
        else toast.error("复制失败");
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

    /**
     * 双击 = **打开**：
     *  - 文件夹 → 进入该目录（单击只选中，所以「进入」挪到双击）
     *  - 图片   → 大图预览弹窗
     *  - 其它文件 → 直接下载（保持原来的双击行为）
     */
    const openItemSecondary = (item: AdminFileItem) => {
        if (isFolder(item)) {
            setUri(`${item.path.replace(/\/+$/, "")}/`);
            return;
        }
        if (isImage(item)) {
            setPreview(item);
            return;
        }
        downloadItem(item);
    };

    /** 预览弹窗里的「查看详情」：关掉预览、打开右侧详情抽屉（图片单击改成了预览，详情从这里进） */
    const openDetailFromPreview = () => {
        if (preview) setDetail(preview);
        setPreview(null);
    };

    /** 打开重命名对话框（右键菜单与行内按钮共用同一套 PromptDialog） */
    const openRenameDialog = (item: AdminFileItem) =>
        setDialog({
            kind: "prompt",
            title: "重命名",
            defaultValue: item.name,
            confirmText: "保存",
            onSubmit: (v) => submitRename(item, v),
        });

    /** 上传完成后的统一收尾：成功提示 / 失败逐个提示 / 刷新当前目录 */
    const finishUpload = async (outcome: UploadFilesOutcome) => {
        const { succeeded, failed, canceled } = outcome;
        if (succeeded.length > 0) {
            // 多个文件时把名字列出来，方便确认到底传上去了哪几个（改名的情况也能看到）
            const names = succeeded.map((r) => r.name);
            const description = succeeded.length <= 3 ? names.join("、") : `${names.slice(0, 3).join("、")} 等 ${succeeded.length} 个`;
            toast.success(canceled ? `已取消，已上传 ${succeeded.length} 个文件` : `已上传 ${succeeded.length} 个文件`, {
                description,
            });
        }
        // 每个失败的文件单独一条提示，互不影响（不合并成一条，避免看漏）
        for (const item of failed) {
            toast.error(`${item.file.name} 上传失败`, { description: item.message });
        }
        if (failed.length === 0 && succeeded.length === 0 && !canceled) toast.info("没有可上传的文件");
        // 有文件真的落盘了才刷新列表（纯失败/纯取消不打扰后端）
        if (succeeded.length > 0) await load(uri);
    };

    /**
     * 上传入口（工具条按钮与拖拽共用）。
     * 进度/取消/重试/清理会话全部由 src/lib/api-file-upload.ts 负责，这里只管 UI 状态与提示。
     */
    const startUpload = async (picked: File[]) => {
        if (picked.length === 0) return;
        if (uploadFile) {
            toast.info("已有文件正在上传，请等它结束或先取消");
            return;
        }
        const controller = new AbortController();
        abortRef.current = controller;
        setUploadProgress(null);
        let outcome: UploadFilesOutcome;
        try {
            // 先占位「正在上传」，这样按钮立刻进入 loading（第一个文件建会话前就有反馈）
            setUploadFile(picked[0]);
            outcome = await uploadFilesToFileManager({
                uri,
                files: picked,
                signal: controller.signal,
                onProgress: (file, progress) => {
                    setUploadFile(file);
                    setUploadProgress(progress);
                },
            });
        } catch (e) {
            // 建会话/取策略这类整体性失败（每个文件的失败已在 outcome 里逐个返回）
            toast.error(e instanceof Error ? e.message : "上传失败");
            outcome = { succeeded: [], failed: [], canceled: false };
        } finally {
            abortRef.current = null;
            setUploadFile(null);
            setUploadProgress(null);
        }
        await finishUpload(outcome);
    };

    /** 「取消」：中断在途分片并让编排层删掉后端上传会话 */
    const cancelUpload = () => {
        abortRef.current?.abort();
        toast.info("正在取消上传…");
    };

    /** 打开目录选择对话框（右键菜单与工具条共用同一套 FolderPickerDialog） */
    const openPickerDialog = (mode: "move" | "copy", item: AdminFileItem) =>
        setDialog({ kind: "picker", mode, ids: [item.id] });

    /** 详细信息：打开屏幕右侧的详情抽屉（目录会再拉一次大小统计） */
    const openDetailPanel = (item: AdminFileItem) => setDetail(item);

    /** 删除：确认走站内弹窗（原先的 window.confirm），确认后 DELETE /api/admin/file，JSON 体 { ids } */
    const confirmRemoveItem = async (item: AdminFileItem) => {
        if (!(await confirm({ title: `确定删除「${item.name}」吗？`, danger: true }))) return;
        void submitDelete([item.id]);
    };

    /**
     * 获取直链并复制：走后端真实接口 POST /api/admin/direct-links。
     *
     * 直链的来源与拼接：接口返回 `[{ link, file_url }]`，其中 `link` 是**站内相对路径**
     * （实测形如 `/api/f/<publicID>/<name>`，`file_url` 是 `anzhiyu://…` 虚拟路径，不能当 URL 用）。
     * 所以用 `toAbsoluteApiUrl()` 补成完整绝对地址 —— 它会去掉与 `NEXT_PUBLIC_API_URL` 重复的
     * `/api` 前缀，避免拼出 `.../api/api/f/...`；域名一律来自环境变量。
     * 接口拿不到时退回同源下载代理地址（同样补成绝对地址），并在 toast 里说明它需要登录。
     */
    const copyDirectLink = async (item: AdminFileItem) => {
        setBusy(true);
        try {
            const links = await createAdminDirectLinkApi([item.id]);
            const link = links?.[0]?.link;
            if (!link) throw new Error("后端未返回直链");
            const url = toAbsoluteApiUrl(link);
            if (await writeClipboard(url)) toast.success("已复制直链", { description: url });
            else toast.error("复制失败");
        } catch {
            const fallback = toAbsoluteApiUrl(adminFileDownloadUrl(item.id));
            if (await writeClipboard(fallback)) {
                toast.info("后端未返回公开直链，已复制下载地址（需登录才能访问）", { description: fallback });
            } else {
                toast.error("复制失败");
            }
        } finally {
            setBusy(false);
        }
    };

    /** 分享：后端**有**接口 —— 官方前端在用 `POST /api/files/share/create`（配套还有我的分享列表/验密码/取下载地址/删除，属 PRO-文件分享模块）。
     *  我们尚未接；原先注释写的"后端没有分享接口"是错的（当时只查了本地 swagger 与代理目录，而那是部分导出）。 */
    const shareItem = () => toast.info("分享功能待接入（后端已有接口，本页未接）");

    /** 右键菜单的动作集合（菜单只负责排版，动作都在这里，和工具条按钮复用同一批函数） */
    const menuActionsFor = (item: AdminFileItem): ItemMenuActions => ({
        rename: () => openRenameDialog(item),
        move: () => openPickerDialog("move", item),
        copy: () => openPickerDialog("copy", item),
        download: () => downloadItem(item),
        share: () => shareItem(),
        directLink: () => void copyDirectLink(item),
        detail: () => openDetailPanel(item),
        remove: () => void confirmRemoveItem(item),
    });

    /** 分两组渲染：文件夹用「原尺寸」卡，文件用「紧凑」卡（顺序仍是 visible 的顺序） */
    const gridFolders = useMemo(() => visible.filter((f) => isFolder(f)), [visible]);
    const gridFiles = useMemo(() => visible.filter((f) => !isFolder(f)), [visible]);

    /**
     * 详情抽屉里的直链：后端给的可能是相对路径，统一补成绝对地址，
     * 这样「显示的地址」和「复制出来的地址」一致，也不会出现打不开的相对路径。
     */
    const detailDirectUrl = toAbsoluteApiUrl(detailInfo?.url ?? detail?.url);

    /**
     * 网格卡片。`folder` 决定用哪套尺寸：
     *  - true （文件夹）：还原改动前的默认值 —— p-3 / 缩略图 48px(size-12) / 勾选框 left-2 top-2 / gap-2 / 大小文字 text-muted-foreground
     *  - false（文件）  ：紧凑版 —— p-1.5 / 缩略图 80px(size-20) / 勾选框 left-1 top-1 / gap-1.5 / 大小文字 muted-foreground/70
     */
    const renderGridCard = (item: AdminFileItem, folder: boolean) => {
        const checked = selected.includes(item.id);
        return (
            // 右键卡片任意位置（含文件名按钮 / 勾选框）都能弹出菜单
            <ItemContextMenu key={item.id} item={item} actions={menuActionsFor(item)}>
                <div
                    data-fm-item={item.id}
                    data-fm-size={folder ? "folder" : "file"}
                    className={cn(
                        "group relative rounded-xl border text-center shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary hover:shadow-md",
                        // 文件夹：保持默认（白底 + 描边 + 阴影）
                        // 文件：**不要任何底色/描边/阴影**，直接坐在页面底色上；靠 hover 的边框高亮与选中态
                        //       （border-primary + ring）来表达反馈 —— 用 CDP 量过：文件卡那层白就是自己的 `bg-card`
                        folder ? "bg-card p-3" : "flex flex-col border-transparent bg-transparent p-1.5 shadow-none hover:shadow-none",
                        checked && "border-primary ring-1 ring-primary/30",
                        detail?.id === item.id && !checked && "border-primary/60"
                    )}
                >
                    {/* 按需求去掉左上角的勾选框：多选改成 Ctrl/Cmd+单击切换、Shift+单击范围选，
                        工具条另有「全选」；批量重命名/移动/复制/删除仍然用 selected 状态。 */}
                    {isImage(item) && (
                        // 图片单击只选中，所以行内保留「预览 / 详情」两个直达入口。
                        // PC：悬停或键盘聚焦时出现；触摸设备（无 hover）常显。
                        <span className="pointer-coarse:opacity-100 absolute right-1 top-1 z-10 flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                            <button
                                type="button"
                                aria-label={`预览 ${item.name}`}
                                title="预览大图（双击卡片同样可以）"
                                onClick={() => setPreview(item)}
                                className="rounded-md border bg-card/90 p-1 text-muted-foreground shadow-sm hover:text-primary"
                            >
                                <Eye className="size-3.5" />
                            </button>
                            <button
                                type="button"
                                aria-label={`查看详情 ${item.name}`}
                                title="详细信息"
                                onClick={() => setDetail(item)}
                                className="rounded-md border bg-card/90 p-1 text-muted-foreground shadow-sm hover:text-primary"
                            >
                                <Info className="size-3.5" />
                            </button>
                        </span>
                    )}
                    <button
                        type="button"
                        onClick={(e) => openItem(item, e)}
                        onDoubleClick={() => openItemSecondary(item)}
                        title={item.name}
                        className={cn("flex w-full flex-col items-center", folder ? "gap-2" : "gap-1.5")}
                    >
                        <span
                            className={cn(
                                "flex items-center justify-center overflow-hidden bg-muted",
                                folder ? "mt-4 size-12 rounded-xl" : "size-20 shrink-0 rounded-lg"
                            )}
                        >
                            <FileThumb item={item} iconClassName={folder ? "size-6" : "size-8"} />
                        </span>
                        <span className="line-clamp-2 w-full break-all text-xs font-medium leading-tight">
                            {item.name}
                        </span>
                        {/* 网格卡不再显示「大小 · 更新时间」那行次要信息（用户要求：名称下方不显示详情）。
                            大小 / 时间 / 路径 / 直链仍然可以在右侧详情抽屉里看到；列表视图不受影响，仍保留这几列。 */}
                    </button>
                </div>
            </ItemContextMenu>
        );
    };

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
                        {/* 上传：点开隐藏的 <input type="file" multiple>，上传到**当前目录**。
                            放在「新建空文件」右侧、与后面那组分隔线之前，和相邻按钮同为 size-9 / size-4 图标。 */}
                        <button
                            type="button"
                            title="上传文件到当前目录"
                            aria-label="上传文件"
                            disabled={busy || !!uploadFile}
                            onClick={() => fileInputRef.current?.click()}
                            className="flex size-9 items-center justify-center text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-50"
                        >
                            {uploadFile ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                        </button>
                        <span className="h-5 w-px bg-border" />
                        <button
                            type="button"
                            title="重命名（选中 1 项）"
                            aria-label="重命名"
                            disabled={busy || !selectedSingle}
                            onClick={() => {
                                if (!selectedSingle) return;
                                openRenameDialog(selectedSingle);
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
                                void (async () => {
                                    if (!(await confirm({ title: `确定删除选中的 ${ids.length} 项吗？`, danger: true }))) return;
                                    void submitDelete(ids);
                                })();
                            }}
                            className="flex size-9 items-center justify-center text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-40"
                        >
                            <Trash2 className="size-4" />
                        </button>
                    </div>

                    {/* 选中态入口（勾选框已按需求去掉）：常显，随时能看到选了几项、一键全选/清除。
                        多选还能用 Ctrl/Cmd+单击切换、Shift+单击范围选。 */}
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>
                            已选中 <span className="font-medium text-foreground">{selected.length}</span> / {visible.length} 项
                        </span>
                        <button
                            type="button"
                            aria-label={allSelected ? "清除选择" : "全选"}
                            disabled={visible.length === 0}
                            onClick={toggleSelectAll}
                            className="rounded-md border px-1.5 py-0.5 transition-colors hover:border-primary hover:text-primary disabled:opacity-40"
                        >
                            {allSelected ? "清除选择" : "全选"}
                        </button>
                        {selected.length > 0 && (
                            <button
                                type="button"
                                aria-label="取消选择"
                                onClick={() => setSelected([])}
                                className="underline underline-offset-2 hover:text-foreground"
                            >
                                取消
                            </button>
                        )}
                    </span>
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

                    {/* 上传进度条：只在传的时候出现，内联在操作条右侧（flex-wrap 下移动端会自动换行，不溢出）。
                        文本用「已传 x / 共 y 片」，比百分比更贴近后端的分片语义；取消按钮直接 abort + 删会话。 */}
                    {uploadFile && (
                        <div
                            className="flex min-w-0 items-center gap-2 rounded-xl border bg-card px-2.5 py-1.5 text-xs shadow-sm"
                            aria-live="polite"
                        >
                            <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" />
                            <span className="hidden max-w-40 truncate font-medium sm:inline" title={uploadFile.name}>
                                {uploadFile.name}
                            </span>
                            <span className="shrink-0 text-muted-foreground">
                                {uploadProgress
                                    ? `${uploadProgress.uploadedChunks}/${uploadProgress.totalChunks} 片 · ${formatSize(uploadProgress.loadedBytes)} / ${formatSize(uploadProgress.size)}`
                                    : "正在创建上传会话…"}
                            </span>
                            <button
                                type="button"
                                aria-label="取消上传"
                                title="取消上传"
                                onClick={cancelUpload}
                                className="shrink-0 rounded-md border px-1.5 py-0.5 transition-colors hover:border-destructive hover:text-destructive"
                            >
                                取消
                            </button>
                        </div>
                    )}
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

            {/* 隐藏的文件选择器：由工具条的「上传」按钮触发。
                accept 不设限（文件管理要能传任意类型，后端另有 allowed_extensions 白名单校验：
                pkg/service/file/upload.go:150-163）；multiple 允许一次选多个，逐个上传、互不影响。 */}
            <input
                ref={fileInputRef}
                type="file"
                multiple
                aria-label="选择要上传的文件"
                className="hidden"
                onChange={(e) => {
                    const picked = Array.from(e.target.files ?? []);
                    // 先清空 value：否则连续两次选同一个文件不会再触发 change
                    e.target.value = "";
                    void startUpload(picked);
                }}
            />

            {/* ===== 内容区（唯一的滚动区：网格视图 / 列表视图共用同一个 admin-scroll） ===== */}
            <div
                // relative 是必需的：globals.css 的 .admin-scroll 只有 overflow:auto，
                // 不加定位上下文的话下面的拖拽遮罩（absolute inset-0）会挂到视口上而不是列表区。
                className="admin-scroll relative"
                onDragEnter={(e) => {
                    // 必须 preventDefault，否则浏览器会用默认行为（直接打开/下载被拖入的文件）
                    if (!e.dataTransfer?.types.includes("Files")) return;
                    e.preventDefault();
                    dragDepthRef.current += 1;
                    if (!uploadFile) setDragActive(true);
                }}
                onDragOver={(e) => {
                    // dragover 每次移动都会触发，preventDefault 是「允许 drop」的必要条件
                    if (!e.dataTransfer?.types.includes("Files")) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = uploadFile ? "none" : "copy";
                }}
                onDragLeave={() => {
                    // 子元素间移动也会触发 dragleave，靠计数归零判断真的离开了列表区
                    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
                    if (dragDepthRef.current === 0) setDragActive(false);
                }}
                onDrop={(e) => {
                    if (!e.dataTransfer?.types.includes("Files")) return;
                    e.preventDefault();
                    dragDepthRef.current = 0;
                    setDragActive(false);
                    // 目录被拖入时 DataTransfer.files 里也会出现条目，后端按扩展名会拒绝，这里只负责提示
                    void startUpload(Array.from(e.dataTransfer.files));
                }}
                onMouseDown={(e) => {
                    // 点空白处清除选中态；点条目 / 勾选框 / 任何按钮都不算空白
                    const el = e.target as HTMLElement;
                    if (!el.closest("[data-fm-item], button, a, input")) setSelected([]);
                }}
            >
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
                    // 卡片贴紧内容：auto-fill + 6.5rem 下限 → 一屏尽量多放，同时每个卡都不会被拉得比「缩略图 + 文字」宽太多
                    // 网格视图分两组渲染（文件夹在前、文件在后，顺序与 visible 一致）：
                    //   文件夹：**保持改动前的默认尺寸**（p-3 卡片 + 48px 缩略图 + 原网格列数）
                    //   文件：紧凑卡（p-1.5 + 80px 缩略图 + auto-fill，一屏能放更多）
                    // 两组的列宽下限不同，所以分开两个 grid，避免同一行里两种尺寸互相拉扯。
                    <div>
                        {gridFolders.length > 0 && (
                            <div
                                data-fm-grid="folder"
                                className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
                            >
                                {gridFolders.map((item) => renderGridCard(item, true))}
                            </div>
                        )}
                        {gridFiles.length > 0 && (
                            <div
                                data-fm-grid="file"
                                // 卡片贴紧内容：auto-fill + 6.5rem 下限 → 一屏尽量多放，且卡片不会比「缩略图 + 文字」宽太多
                                className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-2 p-2"
                            >
                                {gridFiles.map((item) => renderGridCard(item, false))}
                            </div>
                        )}
                    </div>
                ) : (
                    // 列表视图：表头吸顶；整个列表与网格视图共用外层 admin-scroll，这里不再自带滚动/边框
                    <div>
                        <div className="admin-sticky-head hidden min-w-[800px] grid-cols-[1fr_80px_100px_150px_140px] items-center gap-3 border-b px-4 py-2.5 text-xs font-medium text-muted-foreground sm:grid">
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
                                    // 右键整行（含文件名 / 行内按钮）都能弹出菜单
                                    <ItemContextMenu key={item.id} item={item} actions={menuActionsFor(item)}>
                                        <div
                                            data-fm-item={item.id}
                                            className={cn(
                                                // 勾选框列已按需求去掉（多选改用 Ctrl/Cmd+单击、Shift 范围选、工具条全选）
                                                "grid grid-cols-1 items-center gap-x-3 gap-y-1 border-b px-4 py-2.5 text-sm transition-colors last:border-b-0 hover:bg-muted/40 sm:grid-cols-[1fr_80px_100px_150px_140px]",
                                                checked && "bg-primary/10 ring-1 ring-inset ring-primary/30"
                                            )}
                                        >
                                            <button
                                                type="button"
                                                onClick={(e) => openItem(item, e)}
                                                onDoubleClick={() => openItemSecondary(item)}
                                                className="flex min-w-0 items-center gap-2 text-left"
                                                title={item.name}
                                            >
                                                <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
                                                    <FileThumb item={item} iconClassName="size-4" />
                                                </span>
                                                <span className={cn("truncate", checked ? "font-semibold text-primary" : "font-medium")}>
                                                    {item.name}
                                                </span>
                                            </button>
                                            <span className="text-[10px] text-muted-foreground/70">
                                                {CATEGORY_LABEL[fileCategory(item)]}
                                            </span>
                                            <span className="text-[10px] text-muted-foreground/70 sm:text-right">
                                                {isFolder(item) ? "—" : formatSize(item.size)}
                                            </span>
                                            <span className="text-[10px] text-muted-foreground/70">
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
                                                    aria-label={`查看详情 ${item.name}`}
                                                    title="详细信息"
                                                    onClick={() => setDetail(item)}
                                                >
                                                    <Info className="size-3.5" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon-sm"
                                                    aria-label="重命名"
                                                    title="重命名"
                                                    onClick={() => openRenameDialog(item)}
                                                >
                                                    <Pencil className="size-3.5" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon-sm"
                                                    aria-label="删除"
                                                    title="删除"
                                                    className="text-destructive hover:text-destructive"
                                                    onClick={() => void confirmRemoveItem(item)}
                                                >
                                                    <Trash2 className="size-3.5" />
                                                </Button>
                                            </span>
                                        </div>
                                    </ItemContextMenu>
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

                {/*
                  拖拽上传遮罩：盖在整个列表区上（absolute inset-0 跟着滚动内容，首屏一定可见）。
                  pointer-events-none 很关键 —— 遮罩自己不能吃掉 dragover/drop，否则拖到遮罩上时
                  事件落到遮罩而不是容器，计数与 drop 都会漏。
                */}
                {dragActive && (
                    <div
                        data-fm-dropzone="active"
                        className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-primary/5 p-4"
                    >
                        <div className="flex flex-col items-center gap-1.5 rounded-xl border-2 border-dashed border-primary bg-card/95 px-6 py-5 text-center shadow-lg">
                            <Upload className="size-6 text-primary" />
                            <p className="text-sm font-medium text-foreground">松开即上传到当前目录</p>
                            <p className="max-w-56 truncate text-xs text-muted-foreground" title={uri}>
                                {uri}
                            </p>
                        </div>
                    </div>
                )}
            </div>

            {/*
              ===== 详情抽屉（从屏幕右侧滑入）=====
              以前这里是「卡片底部的一条横面板」，会挤占列表可视高度；改成右侧抽屉后列表不再被压扁。
              容器直接用项目已有的 Sheet（shadcn，`side="right"` 就是右抽屉），没有新增依赖。
              移动端 w-full 占满，PC 端 sm:max-w-md；内容区自己滚动。
              关闭行为全部沿用 Sheet：右上角关闭按钮 / Esc / 点击遮罩（关闭时把 detail 置空）。
            */}
            <Sheet open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
                <SheetContent
                    side="right"
                    // 注意：SheetContent 对右侧抽屉给的默认宽是 `data-[side=right]:w-3/4` / `...:sm:max-w-sm`，
                    // 带属性选择器 → 特异性比普通工具类高。这里要覆盖它必须用 Tailwind v4 的 important 后缀 `!`。
                    className="w-full! gap-0 p-0 sm:max-w-md!"
                >
                    {detail && (
                        <>
                            <SheetHeader className="shrink-0 border-b pr-12">
                                <SheetTitle className="truncate" title={detail.name}>
                                    {detail.name}
                                </SheetTitle>
                                <SheetDescription className="sr-only">
                                    {isFolder(detail) ? "文件夹详细信息" : "文件详细信息"}
                                </SheetDescription>
                            </SheetHeader>

                            <div className="flex shrink-0 flex-wrap items-center gap-1 border-b px-4 py-2">
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
                            </div>

                            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
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
                                    {detailDirectUrl && (
                                        <div className="flex items-center justify-between gap-3 border-b py-1.5 sm:col-span-2">
                                            <dt className="shrink-0 text-muted-foreground">直链</dt>
                                            <dd className="flex min-w-0 items-center gap-1">
                                                <a
                                                    href={detailDirectUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="truncate text-primary hover:underline"
                                                    title={detailDirectUrl}
                                                >
                                                    {detailDirectUrl}
                                                </a>
                                                <Button
                                                    variant="ghost"
                                                    size="icon-sm"
                                                    aria-label="复制直链"
                                                    title="复制直链"
                                                    onClick={() => void copyText(detailDirectUrl, "已复制直链")}
                                                >
                                                    <Copy className="size-3.5" />
                                                </Button>
                                            </dd>
                                        </div>
                                    )}
                                </dl>
                            </div>
                        </>
                    )}
                </SheetContent>
            </Sheet>

            {/* ===== 图片预览弹窗 ===== */}
            {preview && (
                <ImagePreviewDialog
                    item={preview}
                    onClose={() => setPreview(null)}
                    onOpenDetail={openDetailFromPreview}
                />
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
