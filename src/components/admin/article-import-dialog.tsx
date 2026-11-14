"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { AlertTriangle, FileJson, FileArchive, Upload, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    importAdminArticlesApi,
    type ArticleImportOptions,
    type ArticleImportResult,
} from "@/lib/api-articles-io";

/** 本地体积上限，与代理路由保持一致（代理：src/app/api/admin/articles/import/route.ts） */
const MAX_IMPORT_SIZE = 100 * 1024 * 1024;

/** 允许的扩展名（远端 handler.go:933-943 只认 .json / .zip） */
const ALLOWED_EXT = [".json", ".zip"];

/** 远端 default_status 白名单（未知值后端会退化成 DRAFT） */
const STATUS_OPTIONS = [
    { value: "DRAFT", label: "草稿（DRAFT）" },
    { value: "PUBLISHED", label: "已发布（PUBLISHED）" },
    { value: "ARCHIVED", label: "已归档（ARCHIVED）" },
    { value: "SCHEDULED", label: "定时发布（SCHEDULED）" },
];

function formatBytes(size: number): string {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

/** ZIP 或非导出格式的 JSON：不解析内容，只提示后端会怎么处理 */
type Preview = { kind: "count"; total: number; titles: string[] } | { kind: "note"; text: string } | null;

/**
 * 导入文章弹窗（管理端）：POST /api/admin/articles/import → 远端 POST /articles/import。
 *
 * ⚠️ 导入会批量写文章表（按要求还会连带创建缺失的分类 / 标签），所以这里：
 *   - 文案明确写出后果，并给「先导出留档」的提醒；
 *   - 必须勾选确认复选框才能点「开始导入」（二次确认）；
 *   - 结果区展示 总数 / 成功 / 跳过 / 失败 与后端逐条错误原因。
 *
 * 文件格式（源码为准）：.json（导出格式，顶层 { version, export_at, articles: [...] }）
 * 或 .zip（zip 根目录里的 articles.json）；markdown/ 目录只是人工备份，导入器不解析。
 */
export function ArticleImportDialog({
    open,
    onOpenChange,
    onImported,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** 导入成功后回调（用于刷新列表） */
    onImported: () => void;
}) {
    const [file, setFile] = useState<File | null>(null);
    const [fileError, setFileError] = useState("");
    const [preview, setPreview] = useState<Preview>(null);
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<ArticleImportResult | null>(null);
    const [confirmed, setConfirmed] = useState(false);

    // 导入选项（默认值与后端 handler.go:915-918 的默认值一致）
    const [createCategories, setCreateCategories] = useState(true);
    const [createTags, setCreateTags] = useState(true);
    const [skipExisting, setSkipExisting] = useState(true);
    const [defaultStatus, setDefaultStatus] = useState("DRAFT");

    /** 弹窗关闭后异步读文件的结果不再回写（避免对已卸载组件 setState） */
    const aliveRef = useRef(true);
    useEffect(() => {
        aliveRef.current = true;
        return () => {
            aliveRef.current = false;
        };
    }, []);

    const reset = () => {
        setFile(null);
        setFileError("");
        setPreview(null);
        setResult(null);
        setConfirmed(false);
    };

    const handleOpenChange = (next: boolean) => {
        if (!next && busy) return; // 导入中不允许关闭，避免误以为已取消
        onOpenChange(next);
        if (!next) reset();
    };

    /** 选文件：本地先做扩展名 / 体积 / 空文件校验，JSON 额外做个文章数预览 */
    const handleFile = async (picked: File | undefined) => {
        if (!picked) return;
        setResult(null);
        setConfirmed(false);

        const ext = picked.name.slice(picked.name.lastIndexOf(".")).toLowerCase();
        if (!ALLOWED_EXT.includes(ext)) {
            setFile(null);
            setPreview(null);
            setFileError("仅支持 .json 与 .zip 文件（zip 内需含 articles.json）");
            return;
        }
        if (picked.size === 0) {
            setFile(null);
            setPreview(null);
            setFileError("文件是空的");
            return;
        }
        if (picked.size > MAX_IMPORT_SIZE) {
            setFile(null);
            setPreview(null);
            setFileError(`文件不能超过 100MB（当前 ${formatBytes(picked.size)}）`);
            return;
        }

        setFileError("");
        setFile(picked);
        setPreview(null);

        if (ext === ".zip") {
            setPreview({ kind: "note", text: "ZIP 包只读取根目录的 articles.json，markdown/ 仅作备份。" });
            return;
        }

        try {
            const text = await picked.text();
            if (!aliveRef.current) return;
            const data: unknown = JSON.parse(text);
            const articles =
                typeof data === "object" && data !== null ? (data as { articles?: unknown }).articles : null;
            if (Array.isArray(articles)) {
                const titles = articles
                    .slice(0, 5)
                    .map((item) =>
                        typeof item === "object" && item !== null && typeof (item as { title?: unknown }).title === "string"
                            ? ((item as { title: string }).title || "（无标题）")
                            : "（无标题）"
                    );
                setPreview({ kind: "count", total: articles.length, titles });
            } else {
                setPreview({
                    kind: "note",
                    text: '这个 JSON 里没有 articles 数组，不是本系统的导出格式；后端会因「解析 JSON 数据」失败而整体报错。',
                });
            }
        } catch {
            if (!aliveRef.current) return;
            setPreview({ kind: "note", text: "JSON 解析失败：文件可能损坏或不是 JSON，后端会直接报错。" });
        }
    };

    const handleImport = async () => {
        if (!file) {
            toast.error("请先选择要导入的文件");
            return;
        }
        if (!confirmed) {
            toast.error("请先勾选确认，导入会直接写入文章表");
            return;
        }

        const options: ArticleImportOptions = {
            create_categories: createCategories,
            create_tags: createTags,
            skip_existing: skipExisting,
            default_status: defaultStatus,
        };

        setBusy(true);
        setResult(null);
        try {
            const res = await importAdminArticlesApi(file, options);
            setResult(res);
            if (res.success_count > 0) {
                toast.success(`导入完成：新增 ${res.success_count} 篇`, {
                    description: `总数 ${res.total_count}｜跳过 ${res.skipped_count}｜失败 ${res.failed_count}`,
                });
                onImported();
            } else if (res.failed_count > 0) {
                toast.error(`导入失败 ${res.failed_count} 篇，请看弹窗里的错误明细`);
            } else {
                toast.warning("没有任何文章被导入（可能全部被跳过）");
            }
        } catch (e) {
            toast.error(e instanceof Error && e.message ? e.message : "导入失败");
        } finally {
            setBusy(false);
        }
    };

    return (
        <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
            <DialogPrimitive.Portal>
                <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
                <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 max-h-[86vh] w-[min(94vw,36rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto soft-surface p-5 shadow-2xl data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
                    <DialogPrimitive.Title className="text-base font-semibold">导入文章</DialogPrimitive.Title>
                    <DialogPrimitive.Description className="mt-1 text-xs text-muted-foreground">
                        上传本系统导出的 <code>.json</code>，或含 <code>articles.json</code> 的 <code>.zip</code>。
                    </DialogPrimitive.Description>

                    {/* 后果提示：导入是批量写库，不是预览 */}
                    <div className="mt-3 flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
                        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                        <div className="space-y-1">
                            <p className="font-medium">导入会直接写入文章表，属于批量写操作，且不可一键撤销。</p>
                            <p>建议先用列表右上角的「导出」把现有文章导出留档；导入失败的文章不会自动回滚。</p>
                        </div>
                    </div>

                    {/* 选文件 */}
                    <div className="mt-4 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors hover:bg-muted">
                                <Upload className="size-3.5" />
                                选择文件
                                <input
                                    type="file"
                                    accept=".json,.zip,application/json,application/zip"
                                    className="hidden"
                                    disabled={busy}
                                    onChange={(e) => void handleFile(e.target.files?.[0])}
                                />
                            </label>
                            {file && (
                                <span className="inline-flex min-w-0 items-center gap-1.5 rounded-lg bg-muted px-2 py-1 text-xs">
                                    {file.name.toLowerCase().endsWith(".zip") ? (
                                        <FileArchive className="size-3.5 shrink-0" />
                                    ) : (
                                        <FileJson className="size-3.5 shrink-0" />
                                    )}
                                    <span className="max-w-56 truncate">{file.name}</span>
                                    <span className="text-muted-foreground">{formatBytes(file.size)}</span>
                                    <button
                                        type="button"
                                        aria-label="移除已选文件"
                                        disabled={busy}
                                        className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                                        onClick={() => {
                                            setFile(null);
                                            setPreview(null);
                                            setFileError("");
                                            setConfirmed(false);
                                        }}
                                    >
                                        <X className="size-3.5" />
                                    </button>
                                </span>
                            )}
                        </div>
                        {fileError && <p className="text-xs text-destructive">{fileError}</p>}
                        {preview?.kind === "count" && (
                            <div className="rounded-lg border p-2.5 text-xs">
                                <p>
                                    解析到 <span className="font-medium text-foreground">{preview.total}</span> 篇文章
                                </p>
                                {preview.titles.length > 0 && (
                                    <ul className="mt-1 space-y-0.5 text-muted-foreground">
                                        {preview.titles.map((t, i) => (
                                            <li key={`${t}-${i}`} className="truncate">
                                                · {t}
                                            </li>
                                        ))}
                                        {preview.total > preview.titles.length && <li>· …</li>}
                                    </ul>
                                )}
                            </div>
                        )}
                        {preview?.kind === "note" && <p className="text-xs text-muted-foreground">{preview.text}</p>}
                    </div>

                    {/* 导入选项（与远端表单字段一一对应） */}
                    <div className="mt-4 space-y-2 rounded-lg border p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-xs text-muted-foreground">数据里没写状态时的默认状态</span>
                            <Select value={defaultStatus} onValueChange={setDefaultStatus} disabled={busy}>
                                <SelectTrigger className="h-8 w-40 text-xs">
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
                        {[
                            {
                                label: "跳过已存在的文章（按 abbrlink / 标题判断）",
                                checked: skipExisting,
                                set: setSkipExisting,
                            },
                            { label: "分类不存在时自动创建", checked: createCategories, set: setCreateCategories },
                            { label: "标签不存在时自动创建", checked: createTags, set: setCreateTags },
                        ].map((opt) => (
                            <label key={opt.label} className="flex cursor-pointer items-center gap-2 text-xs">
                                <Checkbox
                                    checked={opt.checked}
                                    disabled={busy}
                                    onCheckedChange={(v) => opt.set(v === true)}
                                />
                                {opt.label}
                            </label>
                        ))}
                    </div>

                    {/* 二次确认 */}
                    <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs">
                        <Checkbox
                            className="mt-0.5"
                            checked={confirmed}
                            disabled={busy || !file}
                            onCheckedChange={(v) => setConfirmed(v === true)}
                        />
                        <span>我确认已备份或不需要备份，并了解导入会直接写入文章表（可能连带新建分类 / 标签）。</span>
                    </label>

                    {/* 结果 */}
                    {result && (
                        <div className="mt-4 space-y-2 rounded-lg border p-3 text-xs">
                            <div className="flex flex-wrap gap-x-4 gap-y-1">
                                <span>共 {result.total_count} 篇</span>
                                <span className="text-emerald-600 dark:text-emerald-400">
                                    成功 {result.success_count}
                                </span>
                                <span className="text-muted-foreground">跳过 {result.skipped_count}</span>
                                <span className={result.failed_count > 0 ? "text-destructive" : "text-muted-foreground"}>
                                    失败 {result.failed_count}
                                </span>
                            </div>
                            {(result.errors?.length ?? 0) > 0 && (
                                <ul className="max-h-32 space-y-1 overflow-y-auto text-muted-foreground">
                                    {result.errors?.slice(0, 10).map((err, i) => (
                                        <li key={`${err}-${i}`}>
                                            <span className="text-destructive">失败</span> {err}
                                        </li>
                                    ))}
                                    {(result.errors?.length ?? 0) > 10 && (
                                        <li>…还有 {(result.errors?.length ?? 0) - 10} 条</li>
                                    )}
                                </ul>
                            )}
                            {(result.created_ids?.length ?? 0) > 0 && (
                                <p className="text-muted-foreground">
                                    已创建 {result.created_ids?.length} 篇，可在列表里查看（建议刷新一次列表）。
                                </p>
                            )}
                        </div>
                    )}

                    <div className="mt-5 flex justify-end gap-2">
                        <DialogPrimitive.Close asChild>
                            <Button variant="outline" size="sm" disabled={busy}>
                                关闭
                            </Button>
                        </DialogPrimitive.Close>
                        <Button size="sm" onClick={() => void handleImport()} disabled={busy || !file || !confirmed}>
                            {busy ? "导入中…" : "开始导入"}
                        </Button>
                    </div>
                </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
    );
}
