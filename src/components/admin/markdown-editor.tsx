"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ImagePlus, Loader2, WandSparkles } from "lucide-react";
import { toast } from "sonner";

import { AIWritingDialog } from "@/components/admin/ai-writing-dialog";
import { uploadAdminImageApi } from "@/lib/api";

// 编辑器依赖 DOM，必须客户端渲染（服务端渲染会直接报 window 未定义）
const MDEditor = dynamic(() => import("@uiw/react-md-editor"), { ssr: false });

/**
 * Markdown 编辑器（@uiw/react-md-editor 封装）。
 *
 * - 不带任何 CDN 依赖：样式与预览渲染都由包内提供，离线/内网也能用
 * - 主题：它读 `data-color-mode`，这里跟随本站 <html class="dark"> 同步（含主题切换时的变化）
 * - 图片：直接 Ctrl+V 粘贴截图 → 走后端 /api/admin/articles/upload → 在正文末尾插入 Markdown 图片语法；
 *   也可以用下方「插入图片」按钮选文件。上传成功后光标位置拿不到（编辑器内部 textarea），统一追加到末尾。
 */
export function MarkdownEditor({
    value,
    onChange,
    placeholder,
    height = 460,
}: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    height?: number;
}) {
    const wrapRef = useRef<HTMLDivElement>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    // AI 写作弹窗开关（生成结果同样追加到正文末尾，和图片插入一个策略：
    // 编辑器内部的 textarea 光标位置拿不到，插到中间反而更不可预期）
    const [aiOpen, setAiOpen] = useState(false);
    // 用 ref 存最新 value，避免把 value 挂进 onPaste/upload 的依赖里反复重建。
    // 在 effect 里同步（渲染期不能读写 ref，react-hooks/refs）
    const valueRef = useRef(value);
    useEffect(() => {
        valueRef.current = value;
    }, [value]);

    // 编辑器高度自适应视口（铺满页面），而不是写死一个数字。
    // 直接改 DOM 高度：MDEditor 只接受 number，用 state 又会被 react-hooks/set-state-in-effect 拦。
    useEffect(() => {
        const el = wrapRef.current;
        if (!el) return;
        const resize = () => {
            const editor = el.querySelector<HTMLElement>(".w-md-editor");
            if (!editor) return;
            // 高度 = 编辑器上沿 → 滚动容器可见底部 之间，再扣掉底部工具条与一点留白。
            // 用「相对容器的偏移」而不是视口坐标：容器滚动时两者同步变化，差值不变，所以不用监听 scroll。
            const host = el.closest<HTMLElement>(".admin-scroll") ?? document.documentElement;
            const hostRect = host.getBoundingClientRect();
            const offsetInHost = el.getBoundingClientRect().top - hostRect.top;
            const footer = el.querySelector<HTMLElement>("[data-editor-footer]");
            const footerH = footer ? footer.getBoundingClientRect().height : 0;
            const next = Math.max(300, Math.round(host.clientHeight - offsetInHost - footerH - 16));
            // 已经是目标高度就什么都不做（ResizeObserver 会因我们改高度再次触发，这里避免来回抖）
            if (Math.abs(editor.getBoundingClientRect().height - next) < 2) return;
            editor.style.height = `${next}px`;
            const area = editor.querySelector<HTMLElement>(".w-md-editor-area");
            if (area) area.style.height = `${next - 42}px`; // 减掉编辑器自己的工具栏
        };
        resize();
        window.addEventListener("resize", resize);
        // 编辑器是异步 chunk：用 ResizeObserver 盯着容器，等它真正挂载/尺寸变化时再量一次
        const observer = new ResizeObserver(resize);
        observer.observe(el);
        return () => {
            window.removeEventListener("resize", resize);
            observer.disconnect();
        };
    }, []);

    // 跟着本站的深浅色走（next-themes 会在 <html> 上加/去 dark）
    useEffect(() => {
        const el = wrapRef.current;
        if (!el) return;
        const sync = () =>
            el.setAttribute("data-color-mode", document.documentElement.classList.contains("dark") ? "dark" : "light");
        sync();
        const observer = new MutationObserver(sync);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
        return () => observer.disconnect();
    }, []);

    const uploadFiles = useCallback(
        async (files: File[]) => {
            const images = files.filter((f) => f.type.startsWith("image/"));
            if (images.length === 0) return;
            for (const file of images) {
                setUploading(true);
                try {
                    const { url } = await uploadAdminImageApi(file);
                    const md = `![${file.name || "image"}](${url})\n`;
                    onChange(valueRef.current + md);
                    toast.success("图片已上传并插入正文");
                } catch (e) {
                    toast.error(e instanceof Error ? e.message : "图片上传失败");
                } finally {
                    setUploading(false);
                }
            }
        },
        [onChange]
    );

    // 粘贴：编辑器内部 textarea 的 paste 会冒泡到这里
    const onPaste = useCallback(
        (e: React.ClipboardEvent<HTMLDivElement>) => {
            const files = Array.from(e.clipboardData?.files ?? []);
            if (!files.some((f) => f.type.startsWith("image/"))) return;
            e.preventDefault();
            void uploadFiles(files);
        },
        [uploadFiles]
    );

    return (
        <div ref={wrapRef} className="overflow-hidden rounded-md border" data-color-mode="light">
            <div onPaste={onPaste}>
                <MDEditor
                    value={value}
                    onChange={(v) => onChange(v ?? "")}
                    height={height}
                    preview="live"
                    visibleDragbar={false}
                    textareaProps={{ placeholder }}
                />
            </div>
            <div data-editor-footer className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/30 px-2 py-1.5">
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        disabled={uploading}
                        className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-60"
                    >
                        {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <ImagePlus className="size-3.5" />}
                        {uploading ? "上传中…" : "插入图片"}
                    </button>
                    <span className="text-[11px] text-muted-foreground">也可以直接 Ctrl+V 粘贴截图，会自动上传</span>
                    {/* AI 写作（PRO 接口 POST /api/pro/admin/ai/writing，同源代理透传 SSE）：
                        生成结果追加到正文末尾，插入逻辑与上面的图片插入一致 */}
                    <button
                        type="button"
                        onClick={() => setAiOpen(true)}
                        className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                    >
                        <WandSparkles className="size-3.5" />
                        AI 写作
                    </button>
                </div>
                <span className="text-[11px] tabular-nums text-muted-foreground">{value.length} 字</span>
            </div>
            <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                    void uploadFiles(Array.from(e.target.files ?? []));
                    if (fileRef.current) fileRef.current.value = "";
                }}
            />
            {/* AI 写作弹窗：生成 Markdown 草稿并追加到正文末尾（值取自 ref，避免闭包拿到旧值） */}
            <AIWritingDialog
                open={aiOpen}
                onOpenChange={setAiOpen}
                onInsert={(md) => onChange(`${valueRef.current}${valueRef.current.endsWith("\n") || !valueRef.current ? "" : "\n"}${md}\n`)}
            />
        </div>
    );
}
