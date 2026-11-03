"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { commands as mdCommands, type ICommand } from "@uiw/react-md-editor";
import { Heading1, Heading2, Heading3, ImagePlus, Loader2, WandSparkles } from "lucide-react";
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
    // 实时预览开关：默认关闭 —— 长文（20KB+，含 KaTeX/表格/图片）开着会让页面多渲染一份完整
    // 正文，滚动与输入都明显掉帧（用户 2026-10 反馈"编辑页上下滚动很卡"）。
    const [livePreview, setLivePreview] = useState(false);
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
            const host = el.closest<HTMLElement>(".admin-scroll") ?? document.documentElement;
            const area = editor.querySelector<HTMLElement>(".w-md-editor-area");
            // 工具栏高度**实测**，不要写死：按钮从 20px 放大到 30px 后工具栏是 43px，
            // 写死旧值 42 会让内容区多出 1px，textarea 于是自己滚起来（看起来像多了一条滚动条）。
            const toolbar = editor.querySelector<HTMLElement>(".w-md-editor-toolbar");
            const toolbarH = toolbar ? Math.round(toolbar.getBoundingClientRect().height) : 42;

            /** 应用高度：外层编辑器 = h，内容区 = h - 工具栏 */
            const apply = (h: number) => {
                editor.style.height = `${h}px`;
                if (area) area.style.height = `${h - toolbarH}px`;
            };

            // 高度 = 编辑器上沿 → 滚动容器可见底部，再扣掉底部工具条与留白。
            // 用「相对容器的偏移」而不是视口坐标：容器滚动时两者同步变化，差值不变，所以不用监听 scroll。
            const hostRect = host.getBoundingClientRect();
            const offsetInHost = el.getBoundingClientRect().top - hostRect.top;
            const footer = el.querySelector<HTMLElement>("[data-editor-footer]");
            const footerH = footer ? footer.getBoundingClientRect().height : 0;
            const target = Math.max(300, Math.round(host.clientHeight - offsetInHost - footerH - 16));

            // 已经是目标高度就进入「校正」分支（ResizeObserver 会因我们改高度再次触发，避免来回抖）
            if (Math.abs(editor.getBoundingClientRect().height - target) >= 2) apply(target);

            // 二次校正：算出来的高度仍让外层容器溢出几像素时（内边距、标签行高有出入），
            // 把编辑器再压回去，直到外层不出滚动条 —— 这样页面上只剩编辑器内部那一条。
            const overflow = host.scrollHeight - host.clientHeight;
            if (overflow > 0) {
                const shrunk = Math.max(240, editor.getBoundingClientRect().height - overflow - 2);
                if (Math.abs(editor.getBoundingClientRect().height - shrunk) >= 2) apply(shrunk);
            }
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

    /**
     * 工具栏（两段）：
     * - 左侧排版/插入命令：标题 1~3、加粗/斜体/删除线、引用、行内码、代码块、链接、图片、表格、
     *   分割线、三种列表；用分隔线按「文字样式 / 块级 / 插入 / 列表」分组，比默认那一排更好认。
     * - 右侧：AI 写作 + 帮助。AI 按钮就是需求里要挪到最右边的那个。
     * 按钮尺寸/间距在 globals.css 的 .w-md-editor-toolbar 规则里放大（默认 20px 高太小太挤）。
     */
    const toolbarCommands = useMemo<ICommand[]>(() => {
        // 标题：包内置的 title 命令用文字当图标，放大按钮后会糊成一团，这里换成图标命令
        const heading = (level: 1 | 2 | 3): ICommand => ({
            name: `h${level}`,
            keyCommand: `h${level}`,
            buttonProps: { "aria-label": `标题 ${level}`, title: `标题 ${level}` },
            icon:
                level === 1 ? (
                    <Heading1 className="size-4" />
                ) : level === 2 ? (
                    <Heading2 className="size-4" />
                ) : (
                    <Heading3 className="size-4" />
                ),
            execute: (_state, api) => api.replaceSelection(`${"#".repeat(level)} `),
        });

        // 图片：默认命令只插 ![]() 空语法，这里改成走我们自己的上传（也能 Ctrl+V 粘贴截图）
        const imageUpload: ICommand = {
            name: "image-upload",
            keyCommand: "image-upload",
            buttonProps: { "aria-label": "插入图片", title: "插入图片（也可以直接 Ctrl+V 粘贴截图）" },
            icon: <ImagePlus className="size-4" />,
            execute: () => fileRef.current?.click(),
        };

        return [
            heading(1),
            heading(2),
            heading(3),
            mdCommands.divider,
            mdCommands.bold,
            mdCommands.italic,
            mdCommands.strikethrough,
            mdCommands.divider,
            mdCommands.quote,
            mdCommands.code,
            mdCommands.codeBlock,
            mdCommands.divider,
            mdCommands.link,
            imageUpload,
            mdCommands.table,
            mdCommands.hr,
            mdCommands.divider,
            mdCommands.unorderedListCommand,
            mdCommands.orderedListCommand,
            mdCommands.checkedListCommand,
        ];
    }, []);

    const toolbarExtra = useMemo<ICommand[]>(
        () => [
            {
                name: "ai-writing",
                keyCommand: "ai-writing",
                buttonProps: { "aria-label": "AI 写作", title: "AI 写作" },
                icon: <WandSparkles className="size-4 text-primary" />,
                execute: () => setAiOpen(true),
            },
            mdCommands.divider,
            mdCommands.help,
        ],
        []
    );

    return (
        <div ref={wrapRef} className="overflow-hidden rounded-md border" data-color-mode="light">
            <div onPaste={onPaste}>
                <MDEditor
                    value={value}
                    onChange={(v) => onChange(v ?? "")}
                    height={height}
                    /**
                     * 默认 `edit`，**不要** `live`。
                     *
                     * 原因（2026-10 反馈"编辑页上下滚动很卡"）：`preview="live"` 会在编辑器旁常驻
                     * 一份完整渲染结果 —— 我们这种 20KB+ 的正文（KaTeX / 表格 / 几十张图）等于页面里
                     * 有两份文档，滚动时每一帧都要为这份巨大 DOM 做布局与重绘，非常卡；它还会每敲一个字
                     * 重渲染一次，长文输入也跟着掉帧。
                     *
                     * 而且后台本来就有独立预览（article-form 的「预览」按钮 → 与前台同源的 ArticleBody），
                     * 这里的实时预览是重复的。真要实时看，可用下方「实时预览」按钮临时打开。
                     */
                    commands={toolbarCommands}
                    extraCommands={toolbarExtra}
                    preview={livePreview ? "live" : "edit"}
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
                    {/* 实时预览开关：默认关（长文滚动/输入会卡），需要时临时开 */}
                    <button
                        type="button"
                        onClick={() => setLivePreview((v) => !v)}
                        className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors ${
                            livePreview
                                ? "border-primary/40 bg-primary/10 text-primary"
                                : "text-muted-foreground hover:text-foreground"
                        }`}
                        title="长文开启后会明显变卡（页面里会多渲染一份完整正文）"
                    >
                        {livePreview ? "关闭实时预览" : "实时预览"}
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
