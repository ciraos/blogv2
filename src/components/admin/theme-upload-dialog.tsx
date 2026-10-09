"use client";

// 上传主题压缩包弹窗：先校验（POST /api/theme/validate）再上传安装（POST /api/theme/upload）。
//
// 为什么分两步：官方前端的流程就是「validate → is_valid 才 upload」，并且用 validate 返回的
// existing_theme 判断同名主题已安装，版本不低时带 force_update=true 覆盖更新
// （只读对照 src/app/admin/themes/_hooks/use-theme-page.ts:355-396）。
//
// 后端契约（源码证据）：
//  - 两个接口都是 multipart/form-data、字段名 file；upload 另有可选 force_update="true"
//    （pkg/handler/theme/handler.go:474 / :495 / :541）。
//  - 本地先拦三条：必须是 .zip、≤50MB（handler.go:481-492）、不能空文件，省掉必然失败的往返。
//  - validate 的 data 形状见 src/types/themes.ts 的 ThemeValidationResult。

import { useCallback, useRef, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { FileArchive, TriangleAlert, Upload, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { uploadThemeApi, validateThemeApi } from "@/lib/api-themes-write";
import type { ThemeValidationResult } from "@/types/themes";

/** 与后端 handler.go:488 的 50MB 对齐 */
const MAX_SIZE = 50 * 1024 * 1024;

interface ThemeUploadDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** 上传安装成功后回调（调用方切换 Tab 并刷新列表） */
    onUploaded?: (themeName: string) => void;
}

/** 字节数转可读大小 */
function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** 比较版本号：1 表示 left > right，-1 表示小于，0 相等（对齐官方前端 compareVersions） */
function compareVersions(left: string, right: string): number {
    const a = left.split(".").map(Number);
    const b = right.split(".").map(Number);
    for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
        const x = a[i] || 0;
        const y = b[i] || 0;
        if (x > y) return 1;
        if (x < y) return -1;
    }
    return 0;
}

/**
 * 上传主题弹窗：拖拽 / 点选 zip → 校验 → （同名时）比对版本 → 上传安装。
 * 校验不通过时把后端 errors 全部列出来；通过后展示 metadata 摘要与 warnings。
 */
export function ThemeUploadDialog({ open, onOpenChange, onUploaded }: ThemeUploadDialogProps) {
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [dragOver, setDragOver] = useState(false);
    const [busy, setBusy] = useState(false);
    /** 校验结果（校验成功后才展示，用于决定是否强制更新） */
    const [validation, setValidation] = useState<ThemeValidationResult | null>(null);
    const [forceUpdate, setForceUpdate] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const reset = () => {
        setSelectedFile(null);
        setDragOver(false);
        setValidation(null);
        setForceUpdate(false);
        if (inputRef.current) inputRef.current.value = "";
    };

    const handleOpenChange = (next: boolean) => {
        if (busy) return;
        onOpenChange(next);
        if (!next) reset();
    };

    /** 选中文件：本地先做格式 / 大小校验 */
    const handleFile = useCallback((file: File | undefined) => {
        if (!file) return;
        if (!file.name.toLowerCase().endsWith(".zip")) {
            toast.error("仅支持 ZIP 格式的主题压缩包");
            return;
        }
        if (file.size > MAX_SIZE) {
            toast.error("文件大小不能超过 50MB");
            return;
        }
        if (file.size === 0) {
            toast.error("文件内容为空");
            return;
        }
        setSelectedFile(file);
        // 换文件即作废上一次校验结果
        setValidation(null);
        setForceUpdate(false);
    }, []);

    /** 第一步：校验主题包（不安装） */
    const handleValidate = async () => {
        if (!selectedFile) return;
        setBusy(true);
        setValidation(null);
        try {
            const result = await validateThemeApi(selectedFile);
            setValidation(result);
            if (!result.is_valid) {
                const detail = result.errors?.length ? result.errors.join("；") : "未通过校验";
                toast.error(`主题校验失败：${detail}`);
                return;
            }
            // 同名主题已安装时，按官方前端口径比对版本：低于已装版本直接拦下
            const existing = result.existing_theme;
            if (existing) {
                const nextVersion = result.metadata?.version || "0.0.0";
                const installed = existing.installed_version || existing.version || "0.0.0";
                if (compareVersions(nextVersion, installed) < 0) {
                    toast.warning(`上传版本（${nextVersion}）低于已安装版本（${installed}），请改用更高版本`);
                    return;
                }
                setForceUpdate(true);
                toast.info(`检测到同名主题（已装 v${installed}），将覆盖更新`);
            } else {
                toast.success("主题校验通过");
            }
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "主题校验失败");
        } finally {
            setBusy(false);
        }
    };

    /** 第二步：上传并安装 */
    const handleUpload = async () => {
        if (!selectedFile) return;
        setBusy(true);
        try {
            const result = await uploadThemeApi(selectedFile, forceUpdate);
            toast.success(result?.message || "主题上传并安装成功");
            onUploaded?.(result?.theme_name ?? "");
            onOpenChange(false);
            reset();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "主题上传失败");
        } finally {
            setBusy(false);
        }
    };

    const validated = validation?.is_valid === true;

    return (
        <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
            <DialogPrimitive.Portal>
                <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
                <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-[min(94vw,34rem)] max-h-[86vh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border bg-card p-5 shadow-2xl data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
                    <DialogPrimitive.Title className="flex items-center gap-2 text-base font-semibold">
                        <Upload className="size-4 text-muted-foreground" />
                        上传主题压缩包
                    </DialogPrimitive.Title>
                    <DialogPrimitive.Description className="mt-1 text-xs text-muted-foreground">
                        ZIP 格式、不超过 50MB，包内需含 <code>theme.json</code> 与 <code>index.html</code>
                        。上传会直接解压安装到主题目录。
                    </DialogPrimitive.Description>

                    {/* 拖拽 / 点选区 */}
                    <div
                        role="button"
                        tabIndex={0}
                        onClick={() => inputRef.current?.click()}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
                        }}
                        onDragOver={(e) => {
                            e.preventDefault();
                            setDragOver(true);
                        }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={(e) => {
                            e.preventDefault();
                            setDragOver(false);
                            handleFile(e.dataTransfer.files?.[0]);
                        }}
                        className={cn(
                            "mt-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-colors",
                            dragOver ? "border-primary bg-primary/5" : "border-border/60 hover:border-primary/40"
                        )}
                    >
                        <Upload className="mb-2 size-7 text-muted-foreground/40" />
                        <p className="text-sm text-muted-foreground">拖拽文件到此处，或点击选择</p>
                        <p className="mt-1 text-[11px] text-muted-foreground/60">仅支持 .zip</p>
                        <input
                            ref={inputRef}
                            type="file"
                            accept=".zip,application/zip"
                            className="hidden"
                            onChange={(e) => handleFile(e.target.files?.[0])}
                        />
                    </div>

                    {/* 已选文件 */}
                    {selectedFile && (
                        <div className="mt-3 flex items-center gap-3 rounded-xl border bg-muted/40 px-3 py-2.5">
                            <FileArchive className="size-5 shrink-0 text-primary" />
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium">{selectedFile.name}</p>
                                <p className="text-[11px] text-muted-foreground">{formatFileSize(selectedFile.size)}</p>
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="size-7 shrink-0"
                                disabled={busy}
                                onClick={() => setSelectedFile(null)}
                                aria-label="移除已选文件"
                            >
                                <X className="size-3.5" />
                            </Button>
                        </div>
                    )}

                    {/* 校验结果 */}
                    {validation && (
                        <div className="mt-3 space-y-2 rounded-lg border p-3 text-xs">
                            <div className="flex items-center gap-2">
                                {validated ? (
                                    <span className="text-emerald-600 dark:text-emerald-400">校验通过</span>
                                ) : (
                                    <span className="inline-flex items-center gap-1 text-destructive">
                                        <TriangleAlert className="size-3.5" />
                                        校验未通过
                                    </span>
                                )}
                                {validation.metadata?.version && (
                                    <span className="text-muted-foreground">v{validation.metadata.version}</span>
                                )}
                                {validation.metadata?.displayName && (
                                    <span className="text-muted-foreground">{validation.metadata.displayName}</span>
                                )}
                            </div>

                            {validation.errors && validation.errors.length > 0 && (
                                <ul className="list-inside list-disc space-y-0.5 text-destructive">
                                    {validation.errors.slice(0, 8).map((error, index) => (
                                        <li key={`${error}-${index}`}>{error}</li>
                                    ))}
                                </ul>
                            )}

                            {validation.warnings && validation.warnings.length > 0 && (
                                <ul className="list-inside list-disc space-y-0.5 text-amber-600 dark:text-amber-400">
                                    {validation.warnings.slice(0, 5).map((warning, index) => (
                                        <li key={`${warning}-${index}`}>{warning}</li>
                                    ))}
                                </ul>
                            )}

                            {validation.existing_theme && (
                                <p className="text-muted-foreground">
                                    同名主题已安装：{validation.existing_theme.name}（已装 v
                                    {validation.existing_theme.installed_version ||
                                        validation.existing_theme.version ||
                                        "—"}
                                    ）
                                </p>
                            )}

                            <label className="flex cursor-pointer items-center gap-2 text-muted-foreground">
                                <Checkbox
                                    checked={forceUpdate}
                                    onCheckedChange={(checked) => setForceUpdate(checked === true)}
                                />
                                强制更新（覆盖同名主题，保留原用户配置）
                            </label>
                        </div>
                    )}

                    <div className="mt-5 flex justify-end gap-2">
                        <DialogPrimitive.Close asChild>
                            <Button variant="outline" size="sm" disabled={busy}>
                                取消
                            </Button>
                        </DialogPrimitive.Close>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={busy || !selectedFile}
                            onClick={() => void handleValidate()}
                        >
                            {busy && !validated ? "校验中…" : "校验"}
                        </Button>
                        <Button size="sm" disabled={busy || !selectedFile} onClick={() => void handleUpload()}>
                            {busy && validated ? "上传中…" : "上传并安装"}
                        </Button>
                    </div>
                </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
    );
}
