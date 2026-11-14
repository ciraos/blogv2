"use client";

import { useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Loader2, Server, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { installSsrThemeApi } from "@/lib/api-ssr-theme";

interface SsrInstallDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** 安装成功后回调（列表需要重拉） */
    onInstalled?: (themeName: string) => void;
}

/**
 * 安装 SSR 主题（Next.js standalone 包）。
 *
 * 为什么不是「上传文件」：后端 `POST /admin/ssr-theme/install` 只收 **downloadUrl**，
 * 由后端自己下载 tar.gz 再解压运行（且显式封禁内网地址）。
 * 所以这里让用户填三个字段，本地先按后端规则校验一遍：
 *   · themeName 必须 `theme-` 开头、小写字母/数字/连字符；
 *   · downloadUrl 必须 http(s)；
 *   · version 可空（后端可从 theme.json 读）。
 */
export function SsrInstallDialog({ open, onOpenChange, onInstalled }: SsrInstallDialogProps) {
    const [name, setName] = useState("theme-");
    const [version, setVersion] = useState("");
    const [url, setUrl] = useState("");
    const [busy, setBusy] = useState(false);

    const nameOk = /^theme-[a-z0-9-]+$/.test(name.trim());
    const urlOk = /^https?:\/\//i.test(url.trim());
    const canSubmit = nameOk && urlOk && !busy;

    const submit = async () => {
        if (!canSubmit) return;
        setBusy(true);
        try {
            await installSsrThemeApi({
                themeName: name.trim(),
                ...(version.trim() ? { version: version.trim() } : {}),
                downloadUrl: url.trim(),
            });
            toast.success("SSR 主题已安装，可在列表中启动");
            onInstalled?.(name.trim());
            onOpenChange(false);
            setName("theme-");
            setVersion("");
            setUrl("");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "安装 SSR 主题失败");
        } finally {
            setBusy(false);
        }
    };

    return (
        <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
            <DialogPrimitive.Portal>
                <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]" />
                <DialogPrimitive.Content
                    className="fixed top-1/2 left-1/2 z-50 w-[min(94vw,32rem)] -translate-x-1/2 -translate-y-1/2 soft-surface p-5 shadow-xl"
                    aria-describedby={undefined}
                >
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <DialogPrimitive.Title className="flex items-center gap-2 text-base font-semibold">
                                <Server className="size-4 text-primary" />
                                安装 SSR 主题
                            </DialogPrimitive.Title>
                            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                                填写 tar.gz 的公网下载地址，后端会自行下载并 <code className="font-mono">node server.js</code> 运行。
                                内网地址会被后端拒绝。
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => onOpenChange(false)}
                            aria-label="关闭"
                            className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                            <X className="size-4" />
                        </button>
                    </div>

                    <div className="mt-4 space-y-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="ssr-name" className="text-xs text-muted-foreground">
                                主题标识（theme- 开头，小写）
                            </Label>
                            <Input
                                id="ssr-name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="theme-ciraos"
                                className="h-9 font-mono text-sm"
                            />
                            {name.trim() !== "" && !nameOk && (
                                <p className="text-[11px] text-destructive">只能用小写字母、数字和连字符，且必须以 theme- 开头</p>
                            )}
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="ssr-version" className="text-xs text-muted-foreground">
                                版本（可选，留空读包内 theme.json）
                            </Label>
                            <Input
                                id="ssr-version"
                                value={version}
                                onChange={(e) => setVersion(e.target.value)}
                                placeholder="1.5.0"
                                className="h-9 font-mono text-sm"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="ssr-url" className="text-xs text-muted-foreground">
                                下载地址（tar.gz）
                            </Label>
                            <Input
                                id="ssr-url"
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                                placeholder="https://cdn.example.com/theme-ciraos-1.5.0.tar.gz"
                                className="h-9 font-mono text-xs"
                            />
                            {url.trim() !== "" && !urlOk && (
                                <p className="text-[11px] text-destructive">必须是 http(s) 链接</p>
                            )}
                        </div>
                    </div>

                    <div className="mt-5 flex items-center justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={busy}>
                            取消
                        </Button>
                        <Button size="sm" onClick={() => void submit()} disabled={!canSubmit}>
                            {busy && <Loader2 className="size-3.5 animate-spin" />}
                            开始安装
                        </Button>
                    </div>
                </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
    );
}
