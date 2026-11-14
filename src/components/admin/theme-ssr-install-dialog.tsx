"use client";

import { useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Gauge, Loader2, Server, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { installSsrThemeApi } from "@/lib/api-ssr-theme";
import { isAllowedThemeSource, unwrapMirrorUrl, type MirrorProbeResult } from "@/lib/theme-mirrors";
import { cn } from "@/lib/utils";

interface SsrInstallDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** 安装成功后回调 */
    onInstalled?: (themeName: string) => void;
}

/**
 * 安装 SSR 主题（Next.js standalone 包）。
 *
 * 为什么不是「上传文件」：后端 `POST /admin/ssr-theme/install` 只收 **downloadUrl**，
 * 由后端自己下载 tar.gz 再解压运行（且显式封禁内网地址）。
 *
 * 「测速」按钮：GitHub 直连经常超时，这里把原始链接套上几个国内可用镜像，
 * 由**服务端**并发探一次（8 秒超时、只取前 256KB），按实测吞吐排序，
 * 自动选中最快的一个填回下载地址。服务端探测才接近 Anheyu 后端的真实体验。
 */
export function SsrInstallDialog({ open, onOpenChange, onInstalled }: SsrInstallDialogProps) {
    const [name, setName] = useState("theme-");
    const [version, setVersion] = useState("");
    const [url, setUrl] = useState("");
    const [busy, setBusy] = useState(false);

    const [probing, setProbing] = useState(false);
    const [probes, setProbes] = useState<MirrorProbeResult[]>([]);
    const [probeNote, setProbeNote] = useState("");

    const nameOk = /^theme-[a-z0-9-]+$/.test(name.trim());
    const urlOk = /^https?:\/\//i.test(url.trim());
    const canSubmit = nameOk && urlOk && !busy && !probing;

    /** 测速：服务端并发探测直连 + 各镜像，按吞吐排序，自动填最快 */
    const probe = async () => {
        const raw = url.trim();
        if (!raw) {
            toast.error("请先填写下载地址");
            return;
        }
        const original = unwrapMirrorUrl(raw);
        if (!isAllowedThemeSource(original)) {
            toast.error("只支持 GitHub 系地址（github.com / raw / codeload 等）");
            return;
        }

        setProbing(true);
        setProbeNote("正在并发测速…");
        try {
            const res = await fetch("/api/admin/theme-mirrors", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url: original }),
            });
            const json = (await res.json()) as {
                code: number;
                message: string;
                data: { results: MirrorProbeResult[]; fastest: string; anyFastEnough?: boolean } | null;
            };
            if (!res.ok || !json.data) {
                throw new Error(json.message || "测速失败");
            }
            setProbes(json.data.results);
            const fastest = json.data.fastest;
            if (fastest) {
                setUrl(fastest);
                const best = json.data.results.find((r) => r.url === fastest);
                const eta = best?.etaSeconds ?? 0;
                if (json.data.anyFastEnough) {
                    setProbeNote(`已选用最快的：${best?.label ?? "—"}（预计 ${eta}s 下完）`);
                } else {
                    setProbeNote(
                        `⚠ 所有镜像都超过后端 60 秒超时，最快的是 ${best?.label ?? "—"}（预计 ${eta}s）。` +
                            "更稳的做法是把包放到自己的域名或对象存储。"
                    );
                }
            } else {
                const failures = json.data.results.filter((r) => !r.ok).map((r) => `${r.label}: ${r.error ?? "失败"}`);
                setProbeNote(`所有镜像都不可用：${failures.slice(0, 2).join("；")}`);
            }
        } catch (error) {
            setProbeNote("");
            toast.error(error instanceof Error ? error.message : "测速失败");
        } finally {
            setProbing(false);
        }
    };

    const submit = async () => {
        if (!canSubmit) return;
        setBusy(true);
        try {
            await installSsrThemeApi({
                themeName: name.trim(),
                ...(version.trim() ? { version: version.trim() } : {}),
                downloadUrl: url.trim(),
            });
            toast.success("SSR 主题已安装");
            onInstalled?.(name.trim());
            onOpenChange(false);
            setName("theme-");
            setVersion("");
            setUrl("");
            setProbes([]);
            setProbeNote("");
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
                    className="fixed top-1/2 left-1/2 z-50 max-h-[88vh] w-[min(94vw,34rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto soft-surface p-5 shadow-xl"
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
                                内网地址会被后端拒绝；GitHub 慢时点「测速选最快」，由服务器并发探测各镜像。
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
                                placeholder="1.6.4"
                                className="h-9 font-mono text-sm"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                                <Label htmlFor="ssr-url" className="text-xs text-muted-foreground">
                                    下载地址（tar.gz）
                                </Label>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-7 px-2 text-xs"
                                    disabled={probing || !url.trim()}
                                    onClick={() => void probe()}
                                >
                                    {probing ? <Loader2 className="size-3.5 animate-spin" /> : <Gauge className="size-3.5" />}
                                    测速选最快
                                </Button>
                            </div>
                            <Input
                                id="ssr-url"
                                value={url}
                                onChange={(e) => {
                                    setUrl(e.target.value);
                                    setProbes([]);
                                    setProbeNote("");
                                }}
                                placeholder="https://github.com/owner/repo/releases/download/v1/theme-x.tar.gz"
                                className="h-9 font-mono text-xs"
                            />
                            {url.trim() !== "" && !urlOk && (
                                <p className="text-[11px] text-destructive">必须是 http(s) 链接</p>
                            )}
                            {probeNote && <p className="text-[11px] text-muted-foreground">{probeNote}</p>}
                        </div>

                        {probes.length > 0 && (
                            <div className="rounded-lg border">
                                <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 border-b px-2.5 py-1.5 text-[11px] text-muted-foreground">
                                    <span>镜像</span>
                                    <span className="text-right">首字节</span>
                                    <span className="text-right">预计下载</span>
                                </div>
                                <div className="max-h-44 overflow-y-auto">
                                    {probes.map((p, index) => {
                                        const selected = p.url === url;
                                        return (
                                            <button
                                                key={p.id}
                                                type="button"
                                                disabled={!p.ok}
                                                onClick={() => {
                                                    setUrl(p.url);
                                                    setProbeNote(`已选用：${p.label}（预计 ${p.etaSeconds ?? 0}s）`);
                                                }}
                                                className={cn(
                                                    "grid w-full grid-cols-[1fr_auto_auto] items-center gap-x-3 px-2.5 py-1.5 text-left text-xs transition-colors",
                                                    p.ok ? "hover:bg-muted/60" : "cursor-not-allowed opacity-50",
                                                    selected && "bg-primary/10 text-primary"
                                                )}
                                            >
                                                <span className="truncate">
                                                    {index === 0 && p.ok ? "★ " : ""}
                                                    {p.label}
                                                    {p.ok && p.slow && (
                                                        <span className="ml-1 text-[10px] text-amber-600 dark:text-amber-400">
                                                            (太慢)
                                                        </span>
                                                    )}
                                                    {!p.ok && <span className="ml-1 text-[10px]">({p.error ?? "失败"})</span>}
                                                </span>
                                                <span className="tabular-nums text-muted-foreground">
                                                    {p.ok ? `${p.ttfb}ms` : "—"}
                                                </span>
                                                <span
                                                    className={cn(
                                                        "tabular-nums",
                                                        p.ok && p.slow ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"
                                                    )}
                                                >
                                                    {p.ok ? `${p.etaSeconds ?? 0}s · ${p.speedMBps}MB/s` : "—"}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
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
