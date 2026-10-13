"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "nextjs-toploader/app";
import { ArrowLeft, ChevronDown, Loader2, Save, Settings2 } from "lucide-react";
import { toast } from "sonner";

import { MarkdownEditor } from "@/components/admin/markdown-editor";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/confirm-provider";
import { Input } from "@/components/ui/input";
import {
    createAdminPageApi,
    getAdminPageApi,
    updateAdminPageApi,
    type AdminPage,
    type AdminPagePayload,
} from "@/lib/api";

/**
 * 自定义页面（留言板 / cookies / 隐私协议 / 版权协议这类）新建 / 编辑共用表单（mode 区分）。
 *
 * ── 为什么从「弹窗」改成整页 ────────────────────────────────────────────────
 * 原来是 page-manager.tsx 里的 max-w-3xl 居中弹窗，正文只能塞在一个 rows=8 的小 textarea 里，
 * 写长文很难受。这里改为与文章编辑器（src/components/admin/article-form.tsx）**同构**的整页版式：
 * 顶栏（返回 + 标题 + 保存）+ 主编辑区（标题 + Markdown 编辑框）+ 右侧设置栏（320px，可收起、窄屏折到下方），
 * 沿用后台既有的 admin-page / admin-card / admin-scroll / admin-page-head 工具类（见 globals.css）。
 *
 * ── 为什么只有 Markdown 编辑框，没有「HTML 内容」框 ──────────────────────────
 * 前台读的是 page.content（HTML）：src/app/(blog)/[...slug]/page.tsx:82 直接
 * `dangerouslySetInnerHTML={{ __html: page.content || "" }}`；markdown_content 前台**根本不读**。
 * 后端接口（src/lib/api.ts:1282 AdminPagePayload / 1315 的注释）要求 create 时 title / path / content
 * 必填，**没有** content_html 字段 —— 所以不能让用户手写 HTML，也不能两个框都摆出来让人猜。
 * 做法与文章编辑器完全一致：用户在界面上只见 Markdown，保存前用 **同一个渲染器**
 * （src/lib/article-markdown.ts 的 renderMarkdownToHtml，含它那套危险元素/协议过滤）把 Markdown
 * 渲染成 HTML 写进 content，Markdown 原文同时写进 markdown_content 存档。
 *
 * 三条保存口径（与文章编辑器的 resolveContentHtml 同思路）：
 *  ① Markdown 有内容且渲染成功 → content = 渲染结果；
 *  ② Markdown 为空（历史页面只存过 HTML）→ 沿用接口回填的 content，**绝不写成空**；
 *  ③ 渲染结果为空（例如正文只有会被过滤掉的原始 HTML）→ 拦在发请求之前，并如实提示。
 *
 * 用「列表 → 编辑页」的真实路由而不是继续用弹窗：这样刷新/直链都停在编辑态，
 * 也让「返回列表」有明确落点（与 /admin/post-management/new、/[id]/edit 同一套形状）。
 */
type Mode = "create" | "edit";

/**
 * 与提交载荷**一一对应**的表单形状。
 * 刻意不带 content（HTML）：它只由 Markdown 渲染而来，不是用户可编辑的输入项 ——
 * 少一个可写状态，就少一条「HTML 与 Markdown 各说各话」的路。
 * 线上表单值是 string/number 这种可比较标量，JSON.stringify 出来的签名才能当「未保存」的比较基准。
 */
type FormState = {
    title: string;
    path: string;
    description: string;
    markdown: string;
    customCss: string;
    customJs: string;
    isPublished: boolean;
    showComment: boolean;
    sort: number;
};

/** 表单 → 提交载荷（content 由调用方按渲染结果补上） */
function toPayload(f: FormState): AdminPagePayload {
    const path = f.path.trim();
    return {
        title: f.title.trim(),
        // 路径统一存成带前导斜杠的形状（前台按 /xxx 匹配，与原来弹窗里的处理一致）
        path: path.startsWith("/") ? path : `/${path}`,
        description: f.description.trim(),
        markdown_content: f.markdown,
        custom_css: f.customCss,
        custom_js: f.customJs,
        is_published: f.isPublished,
        show_comment: f.showComment,
        sort: Number(f.sort) || 0,
    };
}

/** 接口回填 / 提交用的完整表单（含 HTML，只进 ref 不进 state，见 PageForm 里的说明） */
type LoadedState = { form: FormState; contentHtml: string };

function emptyForm(): FormState {
    return {
        title: "",
        path: "",
        description: "",
        markdown: "",
        customCss: "",
        customJs: "",
        isPublished: true,
        showComment: false,
        sort: 0,
    };
}

/** 右栏可折叠卡片（与文章编辑器同一套版式）：卡头一行「标题 + 折叠箭头」 */
function SettingCard({ title, children }: { title: string; children: React.ReactNode }) {
    const [open, setOpen] = useState(true);
    return (
        <section className="rounded-lg border bg-card">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                className="flex w-full items-center gap-2 px-3 py-2 text-left"
            >
                <h3 className="min-w-0 flex-1 truncate text-xs font-semibold tracking-wide text-foreground/85">{title}</h3>
                <ChevronDown
                    className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${open ? "" : "-rotate-90"}`}
                    aria-hidden
                />
            </button>
            {open && <div className="space-y-3 border-t px-3 py-3">{children}</div>}
        </section>
    );
}

/** 单个输入行：label + 控件（与文章编辑器右栏同一套节奏） */
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">
                {label}
                {hint && <span className="ml-1 opacity-70">{hint}</span>}
            </span>
            {children}
        </label>
    );
}

/** 开关行：左侧「标题 + 小字说明」，右侧开关（与文章编辑器同一套 peer 实现） */
function SwitchRow({
    label,
    description,
    checked,
    onChange,
}: {
    label: string;
    description?: string;
    checked: boolean;
    onChange: (v: boolean) => void;
}) {
    return (
        <label className="flex cursor-pointer items-center justify-between gap-3">
            <span className="min-w-0 text-xs leading-snug">
                <span className="block font-medium text-foreground">{label}</span>
                {description && <span className="mt-0.5 block text-[11px] text-muted-foreground/80">{description}</span>}
            </span>
            <span className="relative inline-flex h-5 w-9 shrink-0 items-center">
                <input
                    type="checkbox"
                    role="switch"
                    aria-label={label}
                    checked={checked}
                    onChange={(e) => onChange(e.target.checked)}
                    className="peer sr-only"
                />
                <span
                    aria-hidden
                    className="absolute inset-0 rounded-full bg-input transition-colors peer-checked:bg-primary"
                />
                <span
                    aria-hidden
                    className="absolute left-0.5 top-0.5 size-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4"
                />
            </span>
        </label>
    );
}

/**
 * 编辑态页面 → 表单载荷。
 * 注意 content **原样存进 loadedRef**（不进 state）：它在界面上没有对应控件，
 * 只用于「Markdown 为空时沿用原 HTML」这一条口径，所以刻意不做成可写状态。
 */
function toFormState(page: AdminPage): LoadedState {
    return {
        form: {
            title: page.title ?? "",
            path: page.path ?? "",
            description: page.description ?? "",
            markdown: page.markdown_content ?? "",
            customCss: page.custom_css ?? "",
            customJs: page.custom_js ?? "",
            isPublished: page.is_published ?? true,
            showComment: page.show_comment ?? false,
            sort: page.sort ?? 0,
        },
        contentHtml: page.content ?? "",
    };
}

export function PageForm({ mode, pageId }: { mode: Mode; pageId?: string }) {
    const router = useRouter();
    const [form, setForm] = useState<FormState>(emptyForm);
    const [loading, setLoading] = useState(mode === "edit");
    const [saving, setSaving] = useState(false);
    const [showSettings, setShowSettings] = useState(true);
    /** 编辑态页面的 id（新建成功后会 router.replace 到编辑地址，这里也记一份供后续 PUT） */
    const savedIdRef = useRef<string | undefined>(pageId);
    /** 接口回填的 content（HTML）：界面不显示，Markdown 为空时原样带回，绝不写成空 */
    const loadedContentRef = useRef<string>("");
    /** 「未保存」比较基准：保存成功/载入完成后更新。
        用 state 而不是 ref —— 它要在**渲染期**参与 `dirty` 计算，读 ref 会触发
        `react-hooks/refs`（"Cannot access ref value during render"）。
        初值就是空表单签名：新建态无需在 effect 里同步 setState（那会触发
        `react-hooks/set-state-in-effect`），编辑态等接口回填后再 setBaseline。 */
    const [baseline, setBaseline] = useState<string>(() => JSON.stringify(emptyForm()));

    // 应用内确认弹窗（替代 window.confirm，见 components/confirm-provider.tsx）
    const confirm = useConfirm();

    const set = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
        setForm((prev) => ({ ...prev, [key]: value }));
    }, []);

    useEffect(() => {
        if (mode !== "edit" || !pageId) {
            // 新建：载入完成（无需请求）。基线已在 state 初值里（emptyForm 的签名），
            // 这里不做任何 setState（effect 内同步 setState 会触发 lint 的 set-state-in-effect）
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const page = await getAdminPageApi(pageId);
                if (cancelled) return;
                const loaded = toFormState(page);
                loadedContentRef.current = loaded.contentHtml;
                setForm(loaded.form);
                setBaseline(JSON.stringify(loaded.form));
            } catch (e) {
                if (!cancelled) toast.error(e instanceof Error ? e.message : "加载页面失败");
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [mode, pageId]);

    const dirty = !loading && baseline !== "" && JSON.stringify(form) !== baseline;

    // 未保存拦截：刷新 / 关闭标签页（与文章编辑器同一套 beforeunload）
    useEffect(() => {
        if (!dirty) return;
        const onBeforeUnload = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            e.returnValue = "";
        };
        window.addEventListener("beforeunload", onBeforeUnload);
        return () => window.removeEventListener("beforeunload", onBeforeUnload);
    }, [dirty]);

    const save = async () => {
        if (!form.title.trim()) {
            toast.error("请先填写标题");
            return;
        }
        if (!form.path.trim()) {
            toast.error("请先填写路径", { description: "例如 /message、/privacy —— 前台就是按这个路径访问" });
            return;
        }
        const payload = toPayload(form);
        // 正文 HTML 与校验都在下面：任一步没通过就直接 return（此时还没 setSaving，也不会留下「保存中…」的假象）
        let contentHtml = loadedContentRef.current;
        let renderFailed: string | null = null;
        try {
            /**
             * 正文 HTML：与文章编辑器**同一个**渲染口径（src/lib/article-markdown.ts）。
             * 用动态 import 而不是顶层 import：那个模块会 `import("react-dom/server")`（≈47KB gzip 的懒加载 chunk），
             * 顶层引入会把它拖进页面首屏包，破坏它「只在保存/预览时才下载」的既有设计。
             */
            if (form.markdown.trim()) {
                const { renderMarkdownToHtml } = await import("@/lib/article-markdown");
                contentHtml = await renderMarkdownToHtml(form.markdown);
                if (!contentHtml) {
                    renderFailed = "Markdown 渲染结果为空，已取消保存（没有发出请求）";
                }
            } else if (!contentHtml) {
                // 走到这里说明「Markdown 为空」且「服务端也没有可沿用的 HTML」（新建页 / 历史页面本来就没有正文）：
                // 再提交就等于把前台正文写成空白页，拦在发请求之前（与文章编辑器「渲染为空不保存」同一个防呆）。
                renderFailed = "正文不能为空，已取消保存（没有发出请求）";
            }
        } catch (e) {
            // 渲染器加载/渲染失败（ArticleRenderError 也会落到这里）：同样不发请求
            renderFailed = e instanceof Error ? e.message : "正文渲染失败";
        }
        if (renderFailed) {
            toast.error(renderFailed, {
                description: "Markdown 里可能只有会被安全过滤掉的原始 HTML，或渲染器没加载出来；检查后重试",
            });
            return;
        }
        setSaving(true);
        try {
            const submitPayload: AdminPagePayload = { ...payload, content: contentHtml };
            const saved = savedIdRef.current
                ? await updateAdminPageApi(Number(savedIdRef.current), submitPayload)
                : await createAdminPageApi(submitPayload);
            if (saved?.id !== undefined) {
                savedIdRef.current = String(saved.id);
                // 新建成功后切到编辑地址：后续保存走 PUT，刷新也不会再开一个「新建」
                if (mode === "create" && !pageId) router.replace(`/admin/page-management/${saved.id}/edit`);
            }
            if (saved?.content !== undefined) loadedContentRef.current = saved.content;
            setBaseline(JSON.stringify(form));
            toast.success(mode === "create" ? "页面已创建" : "页面已保存");
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "保存失败");
        } finally {
            setSaving(false);
        }
    };

    // 快捷键 Ctrl/Cmd+S 保存（与文章编辑器的 Ctrl+S 存草稿一致的手感）
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "s") return;
            e.preventDefault();
            void save();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    });

    const backToList = async () => {
        if (dirty && !(await confirm({ title: "有未保存的修改，确定离开吗？" }))) return;
        router.push("/admin/page-management");
    };

    const pathPreview = useMemo(() => {
        const p = form.path.trim();
        if (!p) return "";
        return p.startsWith("/") ? p : `/${p}`;
    }, [form.path]);

    if (loading) {
        return (
            <div className="admin-page">
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" /> 加载中…
                </p>
            </div>
        );
    }

    return (
        <div className="admin-page">
            {/* 顶栏：返回 + 标题 + 保存（对齐文章编辑器 admin-page-head） */}
            <div className="admin-page-head">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" onClick={() => void backToList()} title="返回页面管理">
                        <ArrowLeft className="size-4" />
                    </Button>
                    <div>
                        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
                            {mode === "create" ? "新增页面" : "编辑页面"}
                            {dirty && (
                                <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-normal text-amber-600 dark:text-amber-400">
                                    未保存
                                </span>
                            )}
                        </h2>
                        <p className="mt-1 text-xs text-muted-foreground">
                            {mode === "create"
                                ? "正文用 Markdown 编写，保存时渲染成 HTML 后提交"
                                : `页面 ID：${pageId}${pathPreview ? ` · ${pathPreview}` : ""}`}
                        </p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" onClick={() => setShowSettings((v) => !v)} title="收起/展开右侧设置栏">
                        <Settings2 className="size-4" />
                        {showSettings ? "收起设置" : "设置"}
                    </Button>
                    <Button onClick={() => void save()} disabled={saving} title="Ctrl+S">
                        {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                        {mode === "create" ? "创建" : "保存"}
                    </Button>
                </div>
            </div>

            <div className="admin-card">
                <div className="admin-scroll">
                    {/* lg 下整格锁成滚动容器高度（lg:h-full）：否则行高由更高的右栏决定，
                        左栏（标题 + 正文）被拉到底也填不满，编辑框下方会留出一大片空白。
                        锁定高度后，长内容交给右栏自己滚。 */}
                    <div
                        className={`grid grid-cols-1 gap-5 p-4 sm:p-5 lg:h-full ${
                            showSettings ? "lg:grid-cols-[minmax(0,1fr)_320px]" : ""
                        }`}
                    >
                        {/* ============ 主编辑区 ============ */}
                        <div className="flex min-w-0 flex-col gap-5 lg:min-h-0">
                            <div>
                                <label htmlFor="page-title" className="mb-1.5 block text-xs font-medium text-muted-foreground">
                                    标题 <span className="text-destructive">*</span>
                                </label>
                                <Input
                                    id="page-title"
                                    value={form.title}
                                    onChange={(e) => set("title", e.target.value)}
                                    placeholder="给页面起个标题"
                                    maxLength={100}
                                    className="h-11 text-base"
                                />
                            </div>

                            {/* 正文块：吃掉左栏剩余高度（min-h-0 允许被压，内部交给编辑器滚动） */}
                            <div className="flex min-h-0 flex-1 flex-col">
                                <div className="mb-1.5 flex shrink-0 flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
                                    <span className="text-xs font-medium text-muted-foreground">正文（Markdown）</span>
                                    {/* 用户看不到 HTML 框，必须明确告诉他「Markdown 就是前台内容的来源」，
                                        否则历史页面（库里只有 HTML）改起来会以为是 Markdown 在生效 */}
                                    <span className="text-[11px] leading-relaxed text-muted-foreground/80">
                                        前台按这份 Markdown 渲染显示；历史页面若只有 HTML，未填写时保持原内容不变
                                    </span>
                                </div>
                                {/* 编辑器容器撑满剩余高度（保底 420px）。
                                    -mb-1（-4px）：MarkdownEditor 那把「按 .admin-scroll 可见高度 − 工具条 − 16px」
                                    的自适应算法扣的留白比卡片内边距（sm:p-5 = 20px）少 4px，这里补掉，
                                    免得撑满后底部 4px 溢出被裁 / 压到工具条上（与文章编辑器完全相同的处理）。 */}
                                <div className="-mb-1 flex min-h-[420px] flex-1 flex-col">
                                    <MarkdownEditor
                                        value={form.markdown}
                                        onChange={(v) => set("markdown", v)}
                                        placeholder={"正文用 Markdown 写，工具栏可插入加粗/代码/表格；支持直接 Ctrl+V 粘贴截图自动上传"}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* ============ 右侧设置栏（可收起，收起后编辑区占满整宽） ============ */}
                        {/* lg 下与左栏一样锁成滚动容器高度并自己滚：设置项再长也只滚右栏，不把左栏拖出空白 */}
                        <aside
                            className={`flex-col gap-3 lg:h-full lg:min-h-0 lg:overflow-y-auto ${
                                showSettings ? "flex" : "hidden"
                            }`}
                        >
                            <SettingCard title="页面设置">
                                <Field label="路径" hint="（必填）">
                                    <Input
                                        value={form.path}
                                        onChange={(e) => set("path", e.target.value)}
                                        placeholder="/message"
                                        className="h-9 font-mono text-xs"
                                    />
                                </Field>
                                <p className="text-[11px] leading-relaxed text-muted-foreground">
                                    {pathPreview
                                        ? `前台访问地址：${pathPreview}`
                                        : "前台访问地址：填写后自动补上前导斜杠，例如 /message、/privacy"}
                                </p>
                                <Field label="描述" hint="（选填）">
                                    <Input
                                        value={form.description}
                                        onChange={(e) => set("description", e.target.value)}
                                        placeholder="页面用途，仅后台备注"
                                        className="h-9"
                                    />
                                </Field>
                                <Field label="排序" hint="（数字越小越靠前）">
                                    <Input
                                        type="number"
                                        value={String(form.sort)}
                                        onChange={(e) => set("sort", Number(e.target.value) || 0)}
                                        className="h-9"
                                    />
                                </Field>
                            </SettingCard>

                            <SettingCard title="发布">
                                <SwitchRow
                                    label="发布（前台可访问）"
                                    description="关闭后前台访问该路径会 404"
                                    checked={form.isPublished}
                                    onChange={(v) => set("isPublished", v)}
                                />
                                <SwitchRow
                                    label="显示评论"
                                    description="开启后页面底部出现留言区"
                                    checked={form.showComment}
                                    onChange={(v) => set("showComment", v)}
                                />
                            </SettingCard>

                            <SettingCard title="自定义样式与脚本">
                                <Field label="自定义 CSS" hint="（选填）">
                                    <textarea
                                        value={form.customCss}
                                        onChange={(e) => set("customCss", e.target.value)}
                                        rows={4}
                                        placeholder="只作用于这个页面"
                                        className="w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                                    />
                                </Field>
                                <Field label="自定义 JS" hint="（选填）">
                                    <textarea
                                        value={form.customJs}
                                        onChange={(e) => set("customJs", e.target.value)}
                                        rows={4}
                                        placeholder="只作用于这个页面"
                                        className="w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                                    />
                                </Field>
                            </SettingCard>
                        </aside>
                    </div>
                </div>
            </div>
        </div>
    );
}
