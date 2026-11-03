"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
    Download,
    Eye,
    Image as ImageIcon,
    Link as LinkIcon,
    Loader2,
    Music,
    Pencil,
    Plus,
    RefreshCw,
    Trash2,
    Upload,
    Video as VideoIcon,
    X,
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
    createAdminEssayApi,
    deleteAdminEssayApi,
    getAdminEssaysListApi,
    updateAdminEssayApi,
    uploadAdminEssayImageApi,
} from "@/lib/api";
import {
    MAX_ESSAY_IMPORT_SIZE,
    batchDeleteAdminEssaysApi,
    downloadBlobFile,
    exportAdminEssaysApi,
    formatBytes,
    importAdminEssaysApi,
    isSupportedEssayImportFile,
    type EssayImportOptions,
    type EssayImportResult,
} from "@/lib/api-essays-io";
import { cn, toSameOriginMediaUrl } from "@/lib/utils";
import type { AdminCreateEssayRequest, Essay } from "@/types/essays";

const PAGE_SIZE = 10;

/** 导入结果里最多列出多少条失败原因（后端 errors 可能很长） */
const MAX_SHOWN_IMPORT_ERRORS = 8;

/** 导入文件体积上限的可读文案（导入弹窗里展示） */
const MAX_IMPORT_SIZE_TEXT = formatBytes(MAX_ESSAY_IMPORT_SIZE);

/** 说说内容上限（与官方发布说说对话框一致：正文 5000 字，附带「N / 5000」字数统计） */
const CONTENT_MAX = 5000;

const STATUS_OPTIONS = [
    { value: "1", label: "已发布" },
    { value: "2", label: "草稿" },
    { value: "3", label: "隐藏" },
];

/** 状态徽章（1=发布 2=草稿 3=隐藏） */
function statusBadge(status?: number) {
    if (status === 1) return { label: "已发布", cls: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400" };
    if (status === 2) return { label: "草稿", cls: "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-400" };
    if (status === 3) return { label: "隐藏", cls: "bg-muted text-muted-foreground" };
    return { label: String(status ?? ""), cls: "bg-muted text-muted-foreground" };
}

/**
 * 表单行：标签（必填带 *）+ 控件 + 说明/错误文案。
 * 结构对齐官方前端的 FormInput / FormTextarea（标签在控件上方、说明文字在控件下方）。
 */
function FormField({
    label,
    required,
    description,
    error,
    children,
}: {
    label?: string;
    required?: boolean;
    description?: string;
    error?: string;
    children: React.ReactNode;
}) {
    return (
        <label className="flex flex-col gap-1.5">
            {label && (
                <span className="text-sm font-medium text-foreground/80">
                    {label}
                    {required && <span className="ml-0.5 text-destructive">*</span>}
                </span>
            )}
            {children}
            {(description || error) && (
                <span
                    role={error ? "alert" : undefined}
                    className={cn("text-xs leading-relaxed", error ? "text-destructive" : "text-muted-foreground")}
                >
                    {error || description}
                </span>
            )}
        </label>
    );
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

/** 说说管理页：状态筛选 + 列表（多选批量删除）+ 发布/编辑弹窗 + 删除 + 导出/导入 */
export function EssaysManager() {
    const [list, setList] = useState<Essay[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [statusFilter, setStatusFilter] = useState(""); // "" 全部
    const [loading, setLoading] = useState(true);
    const [refreshKey, setRefreshKey] = useState(0);

    // ===== 多选 / 批量删除 =====
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [deleting, setDeleting] = useState(false);

    // ===== 导出 / 导入 =====
    const [exporting, setExporting] = useState(false);
    const [importOpen, setImportOpen] = useState(false);
    const [importFile, setImportFile] = useState<File | null>(null);
    /** 导入结果是只读的，单独存一份避免重渲染被擦掉 */
    const [importResult, setImportResult] = useState<EssayImportResult | null>(null);
    const [importing, setImporting] = useState(false);
    const [importOptions, setImportOptions] = useState<EssayImportOptions>({
        // 与官方 components/admin/essays/ImportDialog.tsx:29-30 的默认值一致
        skipExisting: true,
        defaultStatus: 1,
    });
    const importInputRef = useRef<HTMLInputElement | null>(null);

    // ===== 编辑弹窗状态 =====
    const [preview, setPreview] = useState<Essay | null>(null);
    const [editing, setEditing] = useState<Essay | null>(null);
    const [createOpen, setCreateOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    /** 图片列表下方的「输入图片 URL」行是否展开（对应官方对话框的「添加链接」贴片） */
    const [urlPanelOpen, setUrlPanelOpen] = useState(false);
    const [imageUrlInput, setImageUrlInput] = useState("");
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [form, setForm] = useState({
        content: "",
        /** 图片列表（官方对话框为缩略图贴片，不再是一行一个地址的文本框） */
        images: [] as string[],
        address: "",
        from: "",
        link: "",
        /** 网易云歌曲 ID（官方对话框的「音乐配置」，空表示不带音乐） */
        songId: "",
        sort_order: "0",
        status: "1",
    });

    const isEdit = Boolean(editing);

    // 应用内确认弹窗（替代 window.confirm，见 components/confirm-provider.tsx）
    const confirm = useConfirm();

    const openEdit = (essay: Essay) => {
        setEditing(essay);
        setCreateOpen(false);
        setUrlPanelOpen(false);
        setImageUrlInput("");
        setForm({
            content: essay.content || "",
            images: [...(essay.image || [])],
            address: essay.address || "",
            from: essay.from || "",
            link: essay.link || "",
            songId: essay.aplayer?.id ? String(essay.aplayer.id) : "",
            sort_order: essay.sort_order != null ? String(essay.sort_order) : "0",
            status: essay.status ? String(essay.status) : "1",
        });
    };

    const closeDialog = () => {
        setEditing(null);
        setCreateOpen(false);
        setUrlPanelOpen(false);
        setImageUrlInput("");
    };

    /** 打开发布弹窗（空表单） */
    const openCreate = () => {
        setEditing(null);
        setUrlPanelOpen(false);
        setImageUrlInput("");
        setForm({
            content: "",
            images: [],
            address: "",
            from: "",
            link: "",
            songId: "",
            sort_order: "0",
            status: "1",
        });
        setCreateOpen(true);
    };

    /** 追加图片地址（去重后加进图片列表） */
    const appendImage = (url: string) => {
        const value = url.trim();
        if (!value) return;
        if (form.images.includes(value)) {
            toast.warning("该图片已添加");
            return;
        }
        setForm((prev) => ({ ...prev, images: [...prev.images, value] }));
    };

    /** 「添加链接」：把输入框里的图片 URL 加进列表 */
    const addImageUrl = () => {
        appendImage(imageUrlInput);
        setImageUrlInput("");
        setUrlPanelOpen(false);
    };

    const removeImage = (index: number) => {
        setForm((prev) => ({ ...prev, images: prev.images.filter((_, i) => i !== index) }));
    };

    /** 选择本地图片 → 走说说自己的上传接口（远端 /pro/essays/upload-image，图片落到 essay_image 目录）拿回本站地址 */
    const handleFile = async (file: File) => {
        if (!file.type.startsWith("image/")) {
            toast.warning("请选择图片文件");
            return;
        }
        setUploading(true);
        try {
            // 后端字段名不完全确定：url / file_id 任一可用即可（解析见 lib/api.ts）
            const { url, file_id } = await uploadAdminEssayImageApi(file);
            const resolved = url || file_id;
            if (!resolved) throw new Error("后端未返回图片 URL");
            appendImage(toSameOriginMediaUrl(resolved));
            toast.success("上传成功");
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "上传失败，请稍后重试");
        } finally {
            setUploading(false);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) void handleFile(file);
        // 清空 value，同一个文件再次选择也能触发 change
        e.target.value = "";
    };

    /** 表单 → 接口请求体（字段口径与官方发布说说对话框一致） */
    const buildPayload = (): AdminCreateEssayRequest => ({
        content: form.content.trim(),
        image: form.images,
        address: form.address.trim() || undefined,
        from: form.from.trim() || undefined,
        link: form.link.trim() || undefined,
        aplayer: form.songId.trim() ? { id: form.songId.trim() } : undefined,
        status: Number(form.status) || 1,
        sort_order: Number(form.sort_order) || 0,
    });

    const handleSave = async () => {
        if (!form.content.trim()) {
            toast.warning("内容不能为空");
            return;
        }
        const payload = buildPayload();
        setSaving(true);
        try {
            if (isEdit && editing) {
                // —— 保存修改 ——
                await updateAdminEssayApi(editing.id, payload);
                toast.success("说说已更新");
                setEditing(null);
            } else {
                // —— 发布 ——
                await createAdminEssayApi(payload);
                toast.success("说说已发布");
                setCreateOpen(false);
            }
            setUrlPanelOpen(false);
            setImageUrlInput("");
            setRefreshKey((k) => k + 1);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : isEdit ? "更新失败" : "发布失败");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (essay: Essay) => {
        if (!(await confirm({ title: "确定删除这条说说吗？", description: essay.content?.slice(0, 40) || "", danger: true }))) return;
        try {
            await deleteAdminEssayApi(essay.id);
            toast.success("删除成功");
            setSelected((prev) => {
                const next = new Set(prev);
                next.delete(essay.id);
                return next;
            });
            setRefreshKey((k) => k + 1);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "删除失败");
        }
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

    /**
     * 批量删除（远端有专门的批量端点，一次请求删完）：
     * 成功清空勾选并刷新；失败**保留勾选**，方便直接重试。
     */
    const handleBatchDelete = async () => {
        const ids = [...selected];
        if (ids.length === 0) return;
        if (!(await confirm({ title: `确定删除选中的 ${ids.length} 条说说吗？`, description: "删除后不可恢复。", danger: true }))) return;
        setDeleting(true);
        try {
            await batchDeleteAdminEssaysApi(ids);
            toast.success(`已删除 ${ids.length} 条说说`);
            setSelected(new Set());
            // 删掉当前页全部且不在第一页时回退一页，避免停在空页
            if (list.length === ids.length && page > 1) setPage((p) => p - 1);
            else setRefreshKey((k) => k + 1);
        } catch (e) {
            // 失败保留勾选：不 setSelected(new Set())，也不刷新
            toast.error(e instanceof Error ? e.message : "批量删除失败");
        } finally {
            setDeleting(false);
        }
    };

    /**
     * 导出说说：远端只支持按 id 导出 ZIP，所以必须先勾选（官方界面同样要求，
     * use-essays-page.ts:130-135）。文件名优先用远端 Content-Disposition，取不到按日期兜底。
     */
    const handleExport = async () => {
        const ids = [...selected];
        if (ids.length === 0) {
            toast.info("请先勾选要导出的说说");
            return;
        }
        setExporting(true);
        try {
            const { blob, filename } = await exportAdminEssaysApi(ids);
            const fallback = `essays-export-${new Date().toISOString().slice(0, 10)}.zip`;
            downloadBlobFile(blob, filename || fallback);
            toast.success(`已导出 ${ids.length} 条说说`, {
                description: "ZIP 文件可直接在「导入」里回灌",
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
        if (!isSupportedEssayImportFile(file.name)) {
            toast.error("只支持 .json 或 .zip 文件");
            resetImport();
            return;
        }
        if (file.size > MAX_ESSAY_IMPORT_SIZE) {
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
            const res = await importAdminEssaysApi(importFile, importOptions);
            setImportResult(res);
            if (res.success_count > 0) {
                toast.success(`导入完成：成功 ${res.success_count} 条`);
                setRefreshKey((k) => k + 1);
            } else if (res.failed_count > 0) {
                toast.warning("没有成功导入任何说说，看看下方失败原因");
            } else {
                toast.info("没有新增说说（可能都被跳过了）");
            }
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "导入失败");
        } finally {
            setImporting(false);
        }
    };

    /** 二次确认：导入会往说说表写数据，文案里写清后果 */
    const confirmImport = async () => {
        if (!importFile) return;
        const ok = await confirm({
            title: "确定导入吗？",
            description:
                `文件：${importFile.name}\n\n` +
                `这会向说说表写入数据（不可撤销）。\n` +
                `已存在的说说：${importOptions.skipExisting ? "跳过（按内容 + 创建时间判重）" : "不判重，可能产生重复"}\n` +
                `默认状态：${
                    importOptions.defaultStatus === 1
                        ? "已发布"
                        : importOptions.defaultStatus === 2
                          ? "草稿"
                          : "隐藏"
                }`,
        });
        if (!ok) return;
        void handleImport();
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

    // 任何宽度都用同一套列模板：窄屏靠 .admin-scroll 横向滚动、操作列 sticky 固定，不再折成卡片。
    // 窄屏也保持 min-w：整张表横向滚动，列不会被压扁。
    const rowGrid = "grid-cols-[16px_minmax(0,1fr)_96px_64px_112px_128px_96px]";
    const rowMinW = "min-w-[820px]";

    return (
        // admin-card：吃掉剩余高度，列表区域（admin-scroll）在卡片内部滚动，不再顶高整页
        <div className="admin-card">
            {/* 工具栏：固定在卡片顶部（shrink-0），不随下方列表滚动。
                工具栏 / 表头 / 数据行共用同一套响应式规则：<640px 竖排成卡片（不撑宽），≥640px 表格式布局 */}
            <div className="flex shrink-0 flex-col gap-2 border-b bg-muted/40 px-4 py-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
                <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
                    {/* 状态筛选 */}
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        状态
                        <Select
                            value={statusFilter}
                            onValueChange={(v) => setStatusFilter(v)}
                        >
                            <SelectTrigger className="h-7 w-full text-xs sm:w-max">
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
                <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
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
                    {/* 导出：远端只支持按 id 导出，未勾选时给出提示（官方同一行为） */}
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={exporting}
                        className="h-7 shrink-0 px-2 text-xs"
                        title={selected.size > 0 ? `导出已勾选的 ${selected.size} 条` : "请先勾选要导出的说说"}
                        onClick={handleExport}
                    >
                        <Download className="size-3.5" />
                        <span className="hidden sm:inline">
                            {exporting ? "导出中…" : selected.size > 0 ? `导出（${selected.size}）` : "导出"}
                        </span>
                    </Button>
                    {/* 导入：弹窗内选文件 + 二次确认；导入会批量写说说表 */}
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={importing}
                        className="h-7 shrink-0 px-2 text-xs"
                        title="从 JSON / ZIP 文件导入说说"
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
                        <span className="hidden sm:inline">发布说说</span>
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
            </div>

            {/* 列表：卡片内唯一滚动区（表头吸顶），工具栏与分页都不动 */}
            <div className="admin-scroll">
                {/* 表头：任何宽度都显示（窄屏横向滚动时需要列名） */}
                <div className={`admin-sticky-head admin-list-head items-center gap-3 border-b px-4 py-2.5 text-xs font-medium text-muted-foreground grid ${rowMinW} ${rowGrid}`}>
                    <span className="flex items-center">
                        <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="全选本页" />
                    </span>
                    <span>内容</span>
                    <span>媒体</span>
                    <span className="text-center">状态</span>
                    <span>信息</span>
                    <span>时间</span>
                    {/* 操作列：3 个 icon-sm（28px）按钮 + 2 个 gap = 92px，列宽取 96px 才装得下 */}
                    <span className="text-right">操作</span>
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
                                className={`grid admin-list-row items-center gap-x-3 gap-y-2 border-b px-4 py-3 text-sm transition-colors last:border-b-0 hover:bg-muted/40 sm:gap-y-1 ${rowMinW} ${rowGrid}`}
                            >
                                {/* 多选：批量删除 / 导出都基于这一列 */}
                                <span className="flex items-center gap-2">
                                    <Checkbox
                                        checked={selected.has(essay.id)}
                                        onCheckedChange={() => toggleOne(essay.id)}
                                        aria-label={`选择说说 #${essay.id}`}
                                    />
                                </span>
                                {/* 内容：移动端卡片的第一行，给两行更易读；桌面仍只一行 */}
                                <div className="min-w-0 max-w-[420px]">
                                    <div className="line-clamp-2 whitespace-pre-line break-words text-foreground sm:line-clamp-1">
                                        {essay.content || "—"}
                                    </div>
                                </div>
                                {/* 媒体列：图片/音乐/视频 */}
                                <div className="text-xs text-muted-foreground">
                                    {media && (
                                        <span className="inline-flex items-center gap-1">
                                            {media.icon}
                                            {media.text}
                                        </span>
                                    )}
                                </div>
                                <div className="sm:text-center">
                                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}>
                                        {badge.label}
                                    </span>
                                </div>
                                <div className="text-xs text-muted-foreground">
                                    <div className="truncate font-medium">{essay.address || "—"}</div>
                                    <div className="truncate text-muted-foreground/60">{essay.from || "—"}</div>
                                </div>
                                <div className="text-xs text-muted-foreground">
                                    <div>{formatDate(essay.created_at)}</div>
                                    <div>{formatTime(essay.created_at)}</div>
                                </div>
                                {/* 操作列：窄屏靠左跟随内容流，≥sm 贴右与表头对齐 */}
                                <div className="flex items-center gap-1 sm:justify-end">
                                    <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        aria-label="编辑"
                                        title="编辑"
                                        className={ACTION_TONE.edit}
                                        onClick={() => openEdit(essay)}
                                    >
                                        <Pencil className="size-4" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        aria-label="预览"
                                        title="预览"
                                        className={ACTION_TONE.view}
                                        onClick={() => setPreview(essay)}
                                    >
                                        <Eye className="size-4" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        aria-label="删除"
                                        title="删除"
                                        className={ACTION_TONE.delete}
                                        onClick={() => handleDelete(essay)}
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
                <span>第 {page} / {totalPages} 页</span>
                <PaginationControls
                    page={page}
                    totalPages={totalPages}
                    onPageChange={setPage}
                />
            </div>

            {/* ===== 发布 / 编辑说说弹窗 =====
                结构对齐官方（PRO 版）「说说管理」的发布说说对话框：
                头部（图标 + 标题 + 一句话说明）→ 滚动区（相关链接 / 说说内容（带 N/5000 字数统计）/
                图片列表（缩略图 + 上传 + 贴链接）/ 音乐配置（网易云歌曲 ID）/ 地址·发布者 / 状态·排序）
                → 底部固定「取消 / 发布（保存修改）」。 */}
            {(editing || createOpen) && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
                    onMouseDown={closeDialog}
                >
                    <div
                        className="flex max-h-[88vh] w-full max-w-2xl flex-col rounded-xl border bg-card shadow-xl"
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        {/* 头部：图标 + 标题 + 说明 */}
                        <div className="flex shrink-0 items-center gap-3 border-b border-border/60 px-5 py-4">
                            <div className="rounded-xl bg-primary/10 p-2">
                                <Plus className="size-5 text-primary" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <h3 className="text-base font-semibold">
                                    {isEdit ? "编辑说说" : "发布说说"}
                                </h3>
                                <p className="mt-0.5 text-xs font-normal text-muted-foreground">
                                    {isEdit ? "修改即刻动态内容" : "发布一条新的即刻动态"}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={closeDialog}
                                aria-label="关闭"
                                className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            >
                                <X className="size-4" />
                            </button>
                        </div>

                        {/* 内容区：唯一的滚动区 */}
                        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-4">
                            {/* 相关链接 */}
                            <FormField label="相关链接">
                                <div className="relative">
                                    <LinkIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                                    <Input
                                        className="pl-8"
                                        value={form.link}
                                        onChange={(e) => setForm({ ...form, link: e.target.value })}
                                        placeholder="https://example.com（可选）"
                                    />
                                </div>
                            </FormField>

                            {/* 说说内容（必填）+ 字数统计 */}
                            <FormField
                                label="说说内容"
                                required
                                description={`${form.content.length} / ${CONTENT_MAX}`}
                            >
                                <textarea
                                    value={form.content}
                                    onChange={(e) => setForm({ ...form, content: e.target.value })}
                                    rows={4}
                                    maxLength={CONTENT_MAX}
                                    placeholder="请输入说说内容... 支持 Markdown：**粗体** *斜体* ~~删除线~~ `代码` [链接](url) ![图片](url)"
                                    className="max-h-48 min-h-[5.5rem] w-full resize-y rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                                />
                                {/* 与前台 essay-content.tsx 的轻量解析保持一致：只支持行内语法，换行按原样保留 */}
                                <p className="text-[11px] leading-relaxed text-muted-foreground">
                                    支持轻量 Markdown：**粗体**、*斜体*、~~删除线~~、`行内代码`、[文字](链接)、![说明](图片)；
                                    换行原样保留。标题/列表/代码块请发文章。
                                </p>
                            </FormField>

                            {/* 图片列表：缩略图贴片 + 上传 + 手动贴链接 */}
                            <div className="space-y-3">
                                <p className="text-sm font-medium text-foreground">图片列表</p>
                                <div className="flex flex-wrap gap-2">
                                    {form.images.map((url, index) => (
                                        <div
                                            key={url}
                                            className="group relative size-20 overflow-hidden rounded-xl border border-border/60 bg-muted/30"
                                        >
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                                src={url}
                                                alt={`图片 ${index + 1}`}
                                                className="size-full object-cover"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => removeImage(index)}
                                                aria-label={`删除图片 ${index + 1}`}
                                                className="absolute top-0.5 right-0.5 flex size-5 cursor-pointer items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                                            >
                                                <X className="size-3" />
                                            </button>
                                        </div>
                                    ))}

                                    {/* 上传图片（走说说自己的上传接口 /api/admin/essays/upload-image） */}
                                    <button
                                        type="button"
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={uploading}
                                        className="flex size-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border/80 bg-muted/30 transition-colors hover:border-primary/50 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        {uploading ? (
                                            <Loader2 className="size-5 animate-spin text-primary" />
                                        ) : (
                                            <>
                                                <Plus className="size-5 text-muted-foreground" />
                                                <span className="text-[10px] text-muted-foreground">上传图片</span>
                                            </>
                                        )}
                                    </button>

                                    {/* 添加链接（保留原先「图片地址」能力，只是收进贴片里） */}
                                    <button
                                        type="button"
                                        onClick={() => setUrlPanelOpen((v) => !v)}
                                        aria-expanded={urlPanelOpen}
                                        className="flex size-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border/80 bg-muted/30 transition-colors hover:border-primary/50 hover:bg-primary/5"
                                    >
                                        <LinkIcon className="size-5 text-muted-foreground" />
                                        <span className="text-[10px] text-muted-foreground">添加链接</span>
                                    </button>
                                </div>

                                {urlPanelOpen && (
                                    <div className="flex items-center gap-2">
                                        <Input
                                            className="flex-1"
                                            value={imageUrlInput}
                                            onChange={(e) => setImageUrlInput(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") {
                                                    e.preventDefault();
                                                    addImageUrl();
                                                }
                                            }}
                                            placeholder="输入图片 URL"
                                        />
                                        <Button
                                            size="sm"
                                            variant="secondary"
                                            className="shrink-0"
                                            onClick={addImageUrl}
                                            disabled={!imageUrlInput.trim()}
                                        >
                                            添加
                                        </Button>
                                    </div>
                                )}

                                <p className="text-xs text-muted-foreground">
                                    支持 JPG、PNG、WEBP 格式，建议尺寸 800x600，也可以直接输入图片链接
                                </p>

                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp,image/gif"
                                    onChange={handleFileChange}
                                    className="hidden"
                                />
                            </div>

                            {/* 音乐配置：只支持网易云歌曲 ID */}
                            <div className="space-y-3">
                                <p className="text-sm font-medium text-foreground">音乐配置</p>
                                <div className="space-y-3 rounded-xl border border-border/60 bg-muted/30 p-3">
                                    <div>
                                        <p className="text-sm text-foreground/80">只支持网易云音乐</p>
                                        <p className="mt-0.5 text-xs text-muted-foreground">
                                            请在网易云音乐中找到歌曲，复制歌曲 ID（歌曲链接中的数字）
                                        </p>
                                    </div>
                                    <div className="flex items-center overflow-hidden rounded-lg border border-input transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30">
                                        <span className="flex h-8 shrink-0 items-center border-r border-border/80 px-2 text-xs text-muted-foreground">
                                            歌曲 ID
                                        </span>
                                        <input
                                            value={form.songId}
                                            onChange={(e) => setForm({ ...form, songId: e.target.value })}
                                            placeholder="请输入网易云音乐歌曲 ID，如：1901371647"
                                            className="h-8 min-w-0 flex-1 bg-transparent px-2.5 text-sm outline-none placeholder:text-muted-foreground"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* 地址 / 发布者（窄屏单列，≥sm 两列） */}
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <FormField label="地址">
                                    <Input
                                        value={form.address}
                                        onChange={(e) => setForm({ ...form, address: e.target.value })}
                                        placeholder="如：深圳"
                                    />
                                </FormField>
                                <FormField label="发布者">
                                    <Input
                                        value={form.from}
                                        onChange={(e) => setForm({ ...form, from: e.target.value })}
                                        placeholder="留空则不显示"
                                    />
                                </FormField>
                            </div>

                            {/* 状态 / 排序 */}
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <FormField label="状态">
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
                                </FormField>
                                <FormField label="排序" description="数值越大越靠前">
                                    <Input
                                        type="number"
                                        value={form.sort_order}
                                        onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
                                        placeholder="0"
                                    />
                                </FormField>
                            </div>
                        </div>

                        {/* 底部操作：固定在弹窗底部 */}
                        <div className="flex shrink-0 items-center justify-end gap-2 border-t px-5 py-3.5">
                            <Button variant="outline" onClick={closeDialog} disabled={saving}>
                                取消
                            </Button>
                            <Button onClick={handleSave} disabled={saving}>
                                {saving && <Loader2 className="size-4 animate-spin" />}
                                {isEdit ? "保存修改" : "发布"}
                            </Button>
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

            {/* ===== 导入说说弹窗（⚠️ 写库，需二次确认） ===== */}
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
                        className="w-full max-w-xl rounded-xl border bg-card p-4 shadow-xl"
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        <div className="mb-3 flex items-center justify-between">
                            <h3 className="text-base font-semibold">导入说说</h3>
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
                                支持 <code>.json</code> 或 <code>.zip</code>
                                （「导出」下载的整包）。单文件不超过 {MAX_IMPORT_SIZE_TEXT}
                                。导入会写入说说表，请先确认文件内容。
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
                                    <span>
                                        跳过已存在的说说
                                        <span className="ml-1 text-muted-foreground">（按内容 + 创建时间判重）</span>
                                    </span>
                                </label>
                                <div className="flex items-center gap-2 text-xs">
                                    <span>文件里没写状态的说说导入为</span>
                                    <Select
                                        value={String(importOptions.defaultStatus)}
                                        disabled={importing}
                                        onValueChange={(v) => {
                                            const n = Number(v);
                                            setImportOptions({
                                                ...importOptions,
                                                defaultStatus: n === 2 ? 2 : n === 3 ? 3 : 1,
                                            });
                                        }}
                                    >
                                        <SelectTrigger className="h-7 w-max text-xs">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {STATUS_OPTIONS.map((o) => (
                                                <SelectItem key={o.value} value={o.value}>
                                                    {o.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            {/* 导入结果（官方 ImportEssayResult） */}
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
