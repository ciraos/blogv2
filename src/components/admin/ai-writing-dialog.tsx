"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Sparkles, Square, WandSparkles, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    AIWritingApiError,
    getAIWritingConfigApi,
    isAIWritingConfigured,
    streamAIWriting,
    type AIWritingConfigOption,
    type AIWritingLength,
    type AIWritingStyle,
} from "@/lib/api-ai";

/** 风格档位兜底（配置接口没返回 styles 时用官方 AIWritingDialog.tsx:15-20 的四档） */
const FALLBACK_STYLE_OPTIONS: Array<{ value: AIWritingStyle; label: string; description?: string }> = [
    { value: "professional", label: "专业技术" },
    { value: "casual", label: "轻松随意" },
    { value: "academic", label: "学术严谨" },
    { value: "creative", label: "创意文学" },
];

/** 长度档位兜底（官方同款文案） */
const FALLBACK_LENGTH_OPTIONS: Array<{ value: AIWritingLength; label: string }> = [
    { value: "short", label: "短篇（0~800 字）" },
    { value: "medium", label: "中篇（800~2000 字）" },
    { value: "long", label: "长篇（2000~5000 字）" },
];

/**
 * 配置状态：loading 中不允许重复读取；error 时如实把错误摆出来，不假装「未配置」。
 * ready 里存的是后端**实际返回**的档位与能力（实测结构与值见 src/lib/api-ai.ts 顶部注释）。
 */
type ConfigState =
    | { status: "loading" }
    | { status: "ready"; enabled: boolean; styles: AIWritingConfigOption[]; lengths: AIWritingConfigOption[]; providers: string[] }
    | { status: "error"; message: string };

/**
 * AI 写作弹窗（对齐官方 components/admin/article-editor/AIWritingDialog.tsx 的交互：
 * 主题 + 风格 + 长度 + 自定义提示词 → 流式预览 → 插入编辑器）。
 *
 * 与官方的两点差异：
 *  1. 打开时先 GET /api/admin/ai/writing/config 判断后端是否配好模型（官方没做这步）。
 *     生成是要计费的写操作，配置都没配就直接打过去只会白烧一次调用。
 *  2. 用的是本站既有的 shadcn 风格组件与主题令牌（官方用 heroui），深浅色都走令牌。
 */
export function AIWritingDialog({
    open,
    onOpenChange,
    onInsert,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onInsert: (content: string) => void;
}) {
    const [topic, setTopic] = useState("");
    const [style, setStyle] = useState<AIWritingStyle>("professional");
    const [length, setLength] = useState<AIWritingLength>("medium");
    const [customPrompt, setCustomPrompt] = useState("");
    const [preview, setPreview] = useState("");
    const [generating, setGenerating] = useState(false);
    const [error, setError] = useState("");
    const [config, setConfig] = useState<ConfigState>({ status: "loading" });

    const controllerRef = useRef<AbortController | null>(null);
    const previewRef = useRef<HTMLDivElement>(null);

    /** 打开时读一次配置（只读 GET；读不到就如实显示，不猜） */
    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        void (async () => {
            try {
                const data = await getAIWritingConfigApi();
                if (cancelled) return;
                setConfig({
                    status: "ready",
                    enabled: isAIWritingConfigured(data),
                    styles: data.styles ?? [],
                    lengths: data.lengths ?? [],
                    providers: data.supported_providers ?? [],
                });
            } catch (e) {
                if (cancelled) return;
                setConfig({ status: "error", message: e instanceof Error ? e.message : "读取配置失败" });
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [open]);

    /** 卸载时中断正在跑的流（组件不常卸载，但编辑器切页面时会） */
    useEffect(() => {
        return () => controllerRef.current?.abort();
    }, []);

    /** 流式预览自动滚到底部（长文时不然看不到新内容） */
    useEffect(() => {
        const el = previewRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [preview]);

    /**
     * 关闭：先中断流再交还控制权。
     * 不在 effect 里监听 open 做这件事 —— 那样要在 effect 里同步 setState（本项目 lint 会拦），
     * 而所有关闭入口都在本组件内部，收敛到一个 close() 更直接。
     */
    const close = useCallback(() => {
        controllerRef.current?.abort();
        controllerRef.current = null;
        setGenerating(false);
        onOpenChange(false);
    }, [onOpenChange]);

    const handleGenerate = useCallback(() => {
        const trimmed = topic.trim();
        if (!trimmed) return;

        controllerRef.current?.abort();
        setGenerating(true);
        setPreview("");
        setError("");

        controllerRef.current = streamAIWriting(
            { topic: trimmed, style, length, customPrompt: customPrompt.trim() || undefined },
            {
                onChunk: (chunk) => setPreview((prev) => prev + chunk),
                onDone: (full) => {
                    // 后端可能只在末尾给完整内容（非流式兜底路径）——preview 为空时补上
                    setPreview((prev) => (prev.length > 0 ? prev : full));
                    setGenerating(false);
                },
                onError: (err: AIWritingApiError) => {
                    setError(err.message);
                    setGenerating(false);
                },
            }
        );
    }, [topic, style, length, customPrompt]);

    const handleStop = useCallback(() => {
        controllerRef.current?.abort();
        controllerRef.current = null;
        setGenerating(false);
    }, []);

    const handleInsert = useCallback(() => {
        if (!preview.trim()) return;
        onInsert(preview);
        toast.success("已插入到正文末尾");
        controllerRef.current = null;
        setGenerating(false);
        onOpenChange(false);
        setPreview("");
        setTopic("");
        setCustomPrompt("");
    }, [preview, onInsert, onOpenChange]);

    if (!open) return null;

    const notConfigured = config.status === "ready" && !config.enabled;
    // 档位优先用后端返回的（有 label/value/description），缺失才退回官方兜底列表
    const styleOptions =
        config.status === "ready" && config.styles.length > 0
            ? config.styles.map((s) => ({ value: s.value as AIWritingStyle, label: s.label, description: s.description }))
            : FALLBACK_STYLE_OPTIONS;
    const lengthOptions =
        config.status === "ready" && config.lengths.length > 0
            ? config.lengths.map((l) => ({ value: l.value as AIWritingLength, label: l.label }))
            : FALLBACK_LENGTH_OPTIONS;
    const providers = config.status === "ready" ? config.providers : [];

    // 必须挂到 body：弹窗是挂在 Markdown 编辑器内部的，而编辑器所在的后台容器有
    // transform/filter 之类的祖先（会为 fixed 后代生成新的包含块），不 portal 的话
    // 遮罩与面板会被裁在编辑器列里（实测：右侧设置栏没被遮住、面板右边缘被切）。
    if (typeof document === "undefined") return null;

    return createPortal(
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            role="dialog"
            aria-modal="true"
            aria-label="AI 写作"
            onMouseDown={generating ? undefined : close}
        >
            <div
                className="flex max-h-[86vh] w-full max-w-3xl flex-col soft-surface p-4 shadow-xl"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h3 className="flex items-center gap-2 text-base font-semibold">
                            <WandSparkles className="size-4 text-primary" />
                            AI 写作
                        </h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                            输入主题后生成文章草稿，插入的是 Markdown 原文（PRO 接口，流式输出）
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={close}
                        aria-label="关闭"
                        className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                        <X className="size-4" />
                    </button>
                </div>

                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
                    {/* 配置状态：enabled=false 就提示去设置页；读不到就如实报错（不假装未配置） */}
                    {config.status === "ready" && config.enabled && (
                        <div className="rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                            后端 AI 写作已启用
                            {providers.length > 0 ? ` · 可用服务商：${providers.join(" / ")}` : ""}
                        </div>
                    )}
                    {notConfigured && (
                        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                            后端返回 enabled = false：AI 写作未启用，生成请求会被拒绝。
                            请先到「设置 → AI → AI 写作」里开启并填好服务商与密钥。
                        </div>
                    )}
                    {config.status === "error" && (
                        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                            读取写作配置失败：{config.message}（该部署可能没有 PRO AI 写作能力；仍可尝试生成，失败原因会照实显示）
                        </div>
                    )}

                    <div className="space-y-1.5">
                        <Label htmlFor="ai-writing-topic">写作主题 / 大纲</Label>
                        <textarea
                            id="ai-writing-topic"
                            value={topic}
                            onChange={(e) => setTopic(e.target.value)}
                            placeholder="例如：Next.js 16 的缓存策略有哪些变化，分别适合什么场景"
                            rows={3}
                            className="w-full resize-y rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                        />
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label>写作风格</Label>
                            <Select value={style} onValueChange={(v) => setStyle(v as AIWritingStyle)}>
                                <SelectTrigger className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {styleOptions.map((o) => (
                                        <SelectItem key={o.value} value={o.value}>
                                            {o.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {/* 风格说明来自后端 styles[].description（实测有值，如「适合技术文章」） */}
                            {(() => {
                                const desc = styleOptions.find((o) => o.value === style)?.description;
                                return desc ? <p className="text-[11px] text-muted-foreground">{desc}</p> : null;
                            })()}
                        </div>
                        <div className="space-y-1.5">
                            <Label>目标长度</Label>
                            <Select value={length} onValueChange={(v) => setLength(v as AIWritingLength)}>
                                <SelectTrigger className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {lengthOptions.map((o) => (
                                        <SelectItem key={o.value} value={o.value}>
                                            {o.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="ai-writing-prompt">自定义提示词（可选）</Label>
                        <Input
                            id="ai-writing-prompt"
                            value={customPrompt}
                            onChange={(e) => setCustomPrompt(e.target.value)}
                            placeholder="额外的写作要求或限制，例如「多用代码示例」"
                        />
                    </div>

                    {error && (
                        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                            {error}
                        </div>
                    )}

                    {(preview || generating) && (
                        <div className="overflow-hidden rounded-lg border">
                            <div className="flex items-center justify-between border-b bg-muted/30 px-3 py-2">
                                <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                                    <Sparkles className="size-3.5" />
                                    {generating ? "生成中…" : "生成结果"}
                                </span>
                                <span className="text-xs tabular-nums text-muted-foreground">{preview.length} 字</span>
                            </div>
                            <div ref={previewRef} className="max-h-72 overflow-y-auto p-3">
                                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                                    {preview || "等待生成…"}
                                </pre>
                            </div>
                        </div>
                    )}
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t pt-3">
                    <Button variant="outline" className="h-8 rounded-lg text-xs" onClick={close}>
                        关闭
                    </Button>
                    {generating ? (
                        <Button variant="destructive" className="h-8 rounded-lg text-xs" onClick={handleStop}>
                            <Square className="size-3.5" />
                            停止生成
                        </Button>
                    ) : (
                        <Button
                            className="h-8 rounded-lg text-xs"
                            onClick={handleGenerate}
                            disabled={!topic.trim()}
                            title={notConfigured ? "后端未配置模型，很可能失败" : undefined}
                        >
                            <WandSparkles className="size-3.5" />
                            {preview ? "重新生成" : "开始生成"}
                        </Button>
                    )}
                    {preview && !generating && (
                        <Button
                            variant="outline"
                            className="h-8 rounded-lg border-primary/40 text-xs text-primary"
                            onClick={handleInsert}
                        >
                            插入到正文
                        </Button>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}
