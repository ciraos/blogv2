"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Code2, Eye, History, ImagePlus, Loader2, Save, Send, Settings2, X } from "lucide-react";
import { toast } from "sonner";

import { MarkdownEditor } from "@/components/admin/markdown-editor";
import { SeoScorePanel } from "@/components/admin/seo-score-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    createAdminArticleApi,
    getAdminArticleApi,
    getAdminArticleCategoriesApi,
    getAdminArticleTagsApi,
    updateAdminArticleApi,
    uploadAdminImageApi,
    type AdminArticlePayload,
} from "@/lib/api";
import type { PostCategory, PostTag } from "@/types/articles";

/**
 * 文章新建 / 编辑共用表单（mode 区分）。
 *
 * 布局：顶栏（返回 + 标题 + 存草稿/发布）+ 主编辑区 + 右侧设置栏（w-80，窄屏折到下方、可由顶部按钮收起）。
 * 设置项：发布（状态/首页展示/置顶/首页排序）、封面与首页图（走 /api/admin/articles/upload）、
 *        主色、原创与版权、SEO（关键词/abbrlink）、IP 归属。
 * 未保存拦截：beforeunload（刷新/关闭）+ 返回列表前的确认。
 *
 * 关于 content_html：后端 model.CreateArticleRequest 同时接受 content_html 与 content_md，但 swagger 未写明
 * content_html 是否由后端生成。这里只提交 content_md，保存后检查返回的 content_html —— 为空就明确告警，
 * 避免出现「存进去了但前台空白」。
 */
type Mode = "create" | "edit";
type Status = "DRAFT" | "PUBLISHED" | "ARCHIVED";

/** 极简 Markdown → HTML（仅用于本地预览，最终以后端渲染为准） */
function mdToHtml(md: string): string {
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const inline = (s: string) =>
        esc(s)
            // 图片要在链接之前匹配，否则 [alt](url) 会被链接规则先吃掉
            .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" class="my-3 max-w-full rounded-lg" />')
            .replace(/`([^`]+)`/g, '<code class="rounded bg-muted px-1 py-0.5 text-[0.9em]">$1</code>')
            .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
            .replace(/\*([^*]+)\*/g, "<em>$1</em>")
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a class="text-primary underline" href="$2" target="_blank" rel="noopener">$1</a>');
    const out: string[] = [];
    let list: string[] = [];
    const flush = () => {
        if (list.length) {
            out.push(`<ul>${list.map((li) => `<li>${li}</li>`).join("")}</ul>`);
            list = [];
        }
    };
    for (const raw of md.replace(/\r\n/g, "\n").split("\n")) {
        const line = raw.trimEnd();
        if (/^\s*[-*]\s+/.test(line)) {
            list.push(inline(line.replace(/^\s*[-*]\s+/, "")));
            continue;
        }
        flush();
        if (!line.trim()) continue;
        const h = line.match(/^(#{1,4})\s+(.*)$/);
        if (h) {
            const lv = Math.min(h[1].length + 1, 5); // # → h2（页面本身已有 h1）
            out.push(`<h${lv}>${inline(h[2])}</h${lv}>`);
        } else if (/^>\s?/.test(line)) {
            out.push(`<blockquote>${inline(line.replace(/^>\s?/, ""))}</blockquote>`);
        } else {
            out.push(`<p>${inline(line)}</p>`);
        }
    }
    flush();
    return out.join("\n");
}

/** 设置栏里的一组：标题 + 内容 */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="rounded-xl border bg-card/60 p-3">
            <h3 className="mb-2.5 text-xs font-semibold tracking-wide text-muted-foreground">{title}</h3>
            <div className="space-y-3">{children}</div>
        </section>
    );
}

/** 单个输入行：label + 控件 */
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

/** 图片字段：上传（走后端 /articles/upload）+ 预览 + 移除 */
function ImageField({
    label,
    value,
    onChange,
}: {
    label: string;
    value: string;
    onChange: (url: string) => void;
}) {
    const [uploading, setUploading] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const pick = async (file: File | undefined) => {
        if (!file) return;
        setUploading(true);
        try {
            const { url } = await uploadAdminImageApi(file);
            onChange(url);
            toast.success(`${label}已上传`);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "上传失败");
        } finally {
            setUploading(false);
            if (inputRef.current) inputRef.current.value = "";
        }
    };

    return (
        <div>
            <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
            {value ? (
                <div className="relative overflow-hidden rounded-lg border">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={value} alt={label} className="h-28 w-full object-cover" />
                    <button
                        type="button"
                        onClick={() => onChange("")}
                        aria-label={`移除${label}`}
                        className="absolute right-1.5 top-1.5 rounded-full bg-background/85 p-1 text-muted-foreground backdrop-blur transition-colors hover:text-destructive"
                    >
                        <X className="size-3.5" />
                    </button>
                </div>
            ) : (
                <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    disabled={uploading}
                    className="flex h-20 w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-60"
                >
                    {uploading ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
                    <span className="text-xs">{uploading ? "上传中…" : "点击上传"}</span>
                </button>
            )}
            <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => pick(e.target.files?.[0])}
            />
        </div>
    );
}

export function ArticleForm({ mode, articleId }: { mode: Mode; articleId?: string }) {
    const router = useRouter();
    // 正文区
    const [title, setTitle] = useState("");
    const [contentMd, setContentMd] = useState("");
    const [summary, setSummary] = useState("");
    const [categoryIds, setCategoryIds] = useState<string[]>([]);
    const [tagIds, setTagIds] = useState<string[]>([]);
    // 设置栏
    const [status, setStatus] = useState<Status>("DRAFT");
    const [showOnHome, setShowOnHome] = useState(true);
    const [pinSort, setPinSort] = useState(0);
    const [homeSort, setHomeSort] = useState(0);
    const [coverUrl, setCoverUrl] = useState("");
    const [topImgUrl, setTopImgUrl] = useState("");
    const [primaryColor, setPrimaryColor] = useState("");
    const [colorManual, setColorManual] = useState(false);
    const [isReprint, setIsReprint] = useState(false);
    const [copyright, setCopyright] = useState(true);
    const [copyrightAuthor, setCopyrightAuthor] = useState("");
    const [copyrightAuthorHref, setCopyrightAuthorHref] = useState("");
    const [copyrightUrl, setCopyrightUrl] = useState("");
    const [keywords, setKeywords] = useState("");
    const [abbrlink, setAbbrlink] = useState("");
    const [ipLocation, setIpLocation] = useState("");
    // 元数据
    const [categories, setCategories] = useState<PostCategory[]>([]);
    const [tags, setTags] = useState<PostTag[]>([]);
    const [loading, setLoading] = useState(mode === "edit");
    const [saving, setSaving] = useState<Status | null>(null);
    const [showPreview, setShowPreview] = useState(false);
    const [showSettings, setShowSettings] = useState(true);
    const [htmlLen, setHtmlLen] = useState<number | null>(null);
    // 新建成功后记住新 id，后续保存走 PUT；baseline 用于未保存判断
    const savedIdRef = useRef<string | undefined>(articleId);
    const baselineRef = useRef<string>("");
    // 本地草稿（localStorage 自动保存，防误关/崩溃丢内容）；contentRef 供粘贴上传后回填光标位置
    const draftKey = `article-draft:${mode}:${articleId ?? "new"}`;
    const [draftAt, setDraftAt] = useState<number | null>(null);

    const buildPayload = useCallback(
        (next: Status): AdminArticlePayload => ({
            title: title.trim(),
            content_md: contentMd,
            status: next,
            post_category_ids: categoryIds,
            post_tag_ids: tagIds,
            summaries: summary
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean),
            cover_url: coverUrl,
            top_img_url: topImgUrl,
            primary_color: primaryColor,
            is_primary_color_manual: colorManual,
            is_reprint: isReprint,
            copyright,
            copyright_author: copyrightAuthor,
            copyright_author_href: copyrightAuthorHref,
            copyright_url: copyrightUrl,
            keywords,
            abbrlink: abbrlink.trim(),
            ip_location: ipLocation,
            show_on_home: showOnHome,
            pin_sort: Number(pinSort) || 0,
            home_sort: Number(homeSort) || 0,
        }),
        [
            title, contentMd, categoryIds, tagIds, summary, coverUrl, topImgUrl, primaryColor, colorManual,
            isReprint, copyright, copyrightAuthor, copyrightAuthorHref, copyrightUrl, keywords, abbrlink,
            ipLocation, showOnHome, pinSort, homeSort,
        ]
    );

    const currentSignature = useMemo(() => JSON.stringify(buildPayload(status)), [buildPayload, status]);
    // 读 ref 只为算「有没有未保存修改」：baseline 参与判断但不参与渲染输出，
    // 换 state 反而会引入 effect 里 setState 的问题，所以这里刻意保留 ref 读取。
    // eslint-disable-next-line react-hooks/refs
    const dirty = baselineRef.current !== "" && currentSignature !== baselineRef.current;

    // 未保存拦截：刷新 / 关闭标签页
    useEffect(() => {
        if (!dirty) return;
        const onBeforeUnload = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            e.returnValue = "";
        };
        window.addEventListener("beforeunload", onBeforeUnload);
        return () => window.removeEventListener("beforeunload", onBeforeUnload);
    }, [dirty]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const [cats, tgs] = await Promise.all([
                getAdminArticleCategoriesApi().catch(() => [] as PostCategory[]),
                getAdminArticleTagsApi().catch(() => [] as PostTag[]),
            ]);
            if (cancelled) return;
            setCategories(cats ?? []);
            setTags(tgs ?? []);

            if (mode === "edit" && articleId) {
                try {
                    const a = await getAdminArticleApi(articleId);
                    if (cancelled) return;
                    setTitle(a.title ?? "");
                    setContentMd(a.content_md ?? "");
                    setStatus((["PUBLISHED", "ARCHIVED"].includes(a.status) ? a.status : "DRAFT") as Status);
                    setSummary((a.summaries ?? []).join("\n"));
                    setCategoryIds((a.post_categories ?? []).map((c) => String(c.id)));
                    setTagIds((a.post_tags ?? []).map((t) => String(t.id)));
                    setCoverUrl(a.cover_url ?? "");
                    setTopImgUrl(a.top_img_url ?? "");
                    setPrimaryColor(a.primary_color ?? "");
                    setColorManual(!!a.is_primary_color_manual);
                    setIsReprint(!!a.is_reprint);
                    setCopyright(a.copyright ?? true);
                    setCopyrightAuthor(a.copyright_author ?? "");
                    setCopyrightAuthorHref(a.copyright_author_href ?? "");
                    setCopyrightUrl(a.copyright_url ?? "");
                    setKeywords(a.keywords ?? "");
                    setAbbrlink(a.abbrlink ?? "");
                    setIpLocation(a.ip_location ?? "");
                    setShowOnHome(a.show_on_home ?? true);
                    setPinSort(a.pin_sort ?? 0);
                    setHomeSort(a.home_sort ?? 0);
                    setHtmlLen((a.content_html ?? "").length);
                } catch (e) {
                    toast.error(e instanceof Error ? e.message : "加载文章失败");
                } finally {
                    if (!cancelled) setLoading(false);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [mode, articleId]);

    // 载入完成（或新建初始状态）后记录基线，作为「未保存」的比较基准
    useEffect(() => {
        if (loading) return;
        baselineRef.current = currentSignature;
    }, [loading, currentSignature]);

    /** 把一份 payload 灌回表单（恢复本地草稿用） */
    const applyDraft = useCallback((d: AdminArticlePayload) => {
        setTitle(d.title ?? "");
        setContentMd(d.content_md ?? "");
        setStatus((d.status ?? "DRAFT") as Status);
        setSummary((d.summaries ?? []).join("\n"));
        setCategoryIds(d.post_category_ids ?? []);
        setTagIds(d.post_tag_ids ?? []);
        setCoverUrl(d.cover_url ?? "");
        setTopImgUrl(d.top_img_url ?? "");
        setPrimaryColor(d.primary_color ?? "");
        setColorManual(!!d.is_primary_color_manual);
        setIsReprint(!!d.is_reprint);
        setCopyright(d.copyright ?? true);
        setCopyrightAuthor(d.copyright_author ?? "");
        setCopyrightAuthorHref(d.copyright_author_href ?? "");
        setCopyrightUrl(d.copyright_url ?? "");
        setKeywords(d.keywords ?? "");
        setAbbrlink(d.abbrlink ?? "");
        setIpLocation(d.ip_location ?? "");
        setShowOnHome(d.show_on_home ?? true);
        setPinSort(d.pin_sort ?? 0);
        setHomeSort(d.home_sort ?? 0);
    }, []);

    // 载入完成时：如果本地有这份草稿，提示是否恢复（不自动覆盖服务端内容）
    useEffect(() => {
        if (loading) return;
        try {
            const raw = localStorage.getItem(draftKey);
            if (!raw) return;
            const parsed = JSON.parse(raw) as { at?: number; data?: AdminArticlePayload };
            if (!parsed?.data) return;
            // 本地草稿只能在客户端 effect 里读；这里同步 setState 是有意的（用于副标题提示）
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setDraftAt(parsed.at ?? null);
            const when = parsed.at ? new Date(parsed.at).toLocaleString("zh-CN", { hour12: false }) : "未知时间";
            toast("发现本地草稿", {
                description: `保存于 ${when}，恢复后覆盖当前表单内容`,
                duration: 10000,
                action: {
                    label: "恢复",
                    onClick: () => {
                        applyDraft(parsed.data as AdminArticlePayload);
                        toast.success("已恢复本地草稿");
                    },
                },
            });
        } catch {
            // 草稿损坏就当没有
        }
        // 只在载入完成时检查一次
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loading]);

    // 有未保存修改时，1.5s 防抖把表单写进 localStorage
    useEffect(() => {
        if (loading || !dirty) return;
        const timer = setTimeout(() => {
            try {
                const at = Date.now();
                localStorage.setItem(draftKey, JSON.stringify({ at, data: buildPayload(status) }));
                setDraftAt(at);
            } catch {
                // 隐私模式/配额满时忽略
            }
        }, 1500);
        return () => clearTimeout(timer);
    }, [dirty, loading, draftKey, buildPayload, status, currentSignature]);

    const previewHtml = useMemo(() => mdToHtml(contentMd), [contentMd]);

    const toggle = (list: string[], id: string, set: (v: string[]) => void) =>
        set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

    const save = async (next: Status) => {
        if (!title.trim()) {
            toast.error("请先填写标题");
            return;
        }
        if (abbrlink && !/^[A-Za-z0-9_-]+$/.test(abbrlink)) {
            toast.error("自定义链接只能包含字母、数字、下划线和短横线");
            return;
        }
        if (primaryColor && !/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(primaryColor)) {
            toast.error("主色需要是 #RGB 或 #RRGGBB 格式");
            return;
        }
        setSaving(next);
        const payload = buildPayload(next);
        try {
            const saved = savedIdRef.current
                ? await updateAdminArticleApi(savedIdRef.current, payload)
                : await createAdminArticleApi(payload);
            const len = (saved?.content_html ?? "").length;
            setHtmlLen(len);
            setStatus(next);
            if (saved?.id !== undefined) {
                savedIdRef.current = String(saved.id);
                if (mode === "create" && !articleId) {
                    // 新建成功后切到编辑地址，后续保存走 PUT
                    router.replace(`/admin/post-management/${saved.id}/edit`);
                }
            }
            baselineRef.current = JSON.stringify({ ...payload });
            // 保存成功即清掉本地草稿（下次打开不会再提示恢复）
            try {
                localStorage.removeItem(draftKey);
            } catch {
                // 忽略
            }
            setDraftAt(null);
            if (contentMd.trim() && len === 0) {
                toast.warning("已保存，但后端没有返回渲染好的正文（content_html 为空），前台可能显示空白");
            } else {
                toast.success(next === "PUBLISHED" ? "已发布" : next === "ARCHIVED" ? "已归档" : "已存为草稿");
            }
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "保存失败");
        } finally {
            setSaving(null);
        }
    };

    // 快捷键：Ctrl/Cmd+S 存草稿、Ctrl/Cmd+Enter 发布。
    // 必须放在 save 声明之后：effect 里引用它，放前面会被 react-hooks 判为「访问未声明变量」。
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (!(e.ctrlKey || e.metaKey)) return;
            const key = e.key.toLowerCase();
            if (key === "s") {
                e.preventDefault();
                void save("DRAFT");
            } else if (e.key === "Enter") {
                e.preventDefault();
                void save("PUBLISHED");
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    });

    const backToList = () => {
        if (dirty && !window.confirm("有未保存的修改，确定离开吗？")) return;
        router.push("/admin/post-management");
    };

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
            {/* 顶栏：返回 + 标题 + 保存/发布 */}
            <div className="admin-page-head">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" onClick={backToList} title="返回文章管理">
                        <ArrowLeft className="size-4" />
                    </Button>
                    <div>
                        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
                            {mode === "create" ? "新增文章" : "编辑文章"}
                            {dirty && (
                                <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-normal text-amber-600 dark:text-amber-400">
                                    未保存
                                </span>
                            )}
                        </h2>
                        <p className="mt-1 text-xs text-muted-foreground">
                            {mode === "create" ? "正文用 Markdown 编写，保存后由后端渲染" : `文章 ID：${articleId}`}
                            {draftAt !== null && (
                                <>
                                    {" · "}
                                    <span title="有未保存修改时每 1.5 秒自动存到本机">
                                        草稿已自动保存 {new Date(draftAt).toLocaleTimeString("zh-CN", { hour12: false })}
                                    </span>
                                </>
                            )}
                            {htmlLen !== null && (
                                <>
                                    {" · "}
                                    {htmlLen > 0 ? (
                                        <span className="text-emerald-600 dark:text-emerald-400">后端已渲染 {htmlLen} 字正文</span>
                                    ) : (
                                        <span className="text-amber-600 dark:text-amber-400">后端未返回正文（前台可能空白）</span>
                                    )}
                                </>
                            )}
                        </p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {/* 历史版本：新建时还没有 id，存过一次（跳回编辑地址）后才出现 */}
                    {articleId && (
                        <Button variant="outline" asChild title="查看历史版本 / 对比 / 回滚">
                            <Link href={`/admin/post-management/${articleId}/history`}>
                                <History className="size-4" />
                                历史版本
                            </Link>
                        </Button>
                    )}
                    {/* 桌面也能收起设置栏，让编辑器铺满整页 */}
                    <Button variant="outline" onClick={() => setShowSettings((v) => !v)} title="收起/展开右侧设置栏">
                        <Settings2 className="size-4" />
                        {showSettings ? "收起设置" : "设置"}
                    </Button>
                    <Button variant="outline" onClick={() => save("DRAFT")} disabled={saving !== null} title="Ctrl+S">
                        {saving === "DRAFT" ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                        存草稿
                    </Button>
                    <Button onClick={() => save("PUBLISHED")} disabled={saving !== null} title="Ctrl+Enter">
                        {saving === "PUBLISHED" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                        发布
                    </Button>
                </div>
            </div>

            <div className="admin-card">
                <div className="admin-scroll">
                    {/* 设置栏收起时，主编辑区直接吃掉整行宽度 */}
                    <div
                        className={`grid grid-cols-1 gap-5 p-4 sm:p-5 ${
                            showSettings ? "lg:grid-cols-[minmax(0,1fr)_320px]" : ""
                        }`}
                    >
                        {/* ============ 主编辑区 ============ */}
                        <div className="flex min-w-0 flex-col gap-5">
                            <div>
                                <label htmlFor="article-title" className="mb-1.5 block text-xs font-medium text-muted-foreground">
                                    标题 <span className="text-destructive">*</span>
                                </label>
                                <Input
                                    id="article-title"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    placeholder="给文章起个标题"
                                    className="h-11 text-base"
                                />
                            </div>

                            <div>
                                <div className="mb-1.5 flex items-center justify-between gap-2">
                                    <span className="text-xs font-medium text-muted-foreground">正文（Markdown）</span>
                                    <Button variant="outline" size="sm" className="h-7" onClick={() => setShowPreview((v) => !v)}>
                                        {showPreview ? <Code2 className="size-3.5" /> : <Eye className="size-3.5" />}
                                        {showPreview ? "继续编辑" : "预览"}
                                    </Button>
                                </div>
                                {showPreview ? (
                                    // 前台样式预览：封面 + 标题 + 分类/标签 + 正文排版（.article-body 与前台同一套样式）
                                    <div className="min-h-[420px] overflow-hidden rounded-md border bg-card">
                                        {coverUrl && (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={coverUrl} alt="" className="h-40 w-full object-cover" />
                                        )}
                                        <div className="px-4 py-4 sm:px-6">
                                            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{title || "（未填标题）"}</h1>
                                            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                                {categories
                                                    .filter((c) => categoryIds.includes(String(c.id)))
                                                    .map((c) => (
                                                        <span key={c.id} className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">
                                                            {c.name}
                                                        </span>
                                                    ))}
                                                {tags
                                                    .filter((t) => tagIds.includes(String(t.id)))
                                                    .map((t) => (
                                                        <span key={t.id} className="rounded-full bg-muted px-2 py-0.5">
                                                            #{t.name}
                                                        </span>
                                                    ))}
                                            </div>
                                            <div
                                                className="article-body mt-5"
                                                // 仅本地预览；最终渲染以后端 content_html 为准
                                                dangerouslySetInnerHTML={{
                                                    __html: previewHtml || '<p class="text-sm text-muted-foreground">（正文为空）</p>',
                                                }}
                                            />
                                        </div>
                                    </div>
                                ) : (
                                    <MarkdownEditor
                                        value={contentMd}
                                        onChange={setContentMd}
                                        placeholder={"## 小标题\n\n正文用 Markdown 写，工具栏可插入加粗/代码/表格；支持直接 Ctrl+V 粘贴截图自动上传"}
                                    />
                                )}
                            </div>
                        </div>

                        {/* ============ 右侧设置栏（可收起，收起后编辑器占满整宽） ============ */}
                        <aside className={`flex-col gap-4 ${showSettings ? "flex" : "hidden"}`}>
                            {/* 发布前自检（对齐参照项目的 SEO 评分面板） */}
                            <SeoScorePanel
                                title={title}
                                contentMd={contentMd}
                                summary={summary}
                                keywords={keywords}
                                abbrlink={abbrlink}
                                coverUrl={coverUrl}
                                categoryCount={categoryIds.length}
                                tagCount={tagIds.length}
                            />
                            <Section title="发布">
                                <Field label="状态">
                                    <select
                                        value={status}
                                        onChange={(e) => setStatus(e.target.value as Status)}
                                        className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring"
                                    >
                                        <option value="DRAFT">草稿</option>
                                        <option value="PUBLISHED">已发布</option>
                                        <option value="ARCHIVED">已归档</option>
                                    </select>
                                </Field>
                                <label className="flex items-center gap-2 text-sm">
                                    <input
                                        type="checkbox"
                                        checked={showOnHome}
                                        onChange={(e) => setShowOnHome(e.target.checked)}
                                        className="size-4 accent-primary"
                                    />
                                    在首页展示
                                </label>
                                <div className="grid grid-cols-2 gap-3">
                                    <Field label="置顶权重">
                                        <Input
                                            type="number"
                                            value={pinSort}
                                            onChange={(e) => setPinSort(Number(e.target.value))}
                                            className="h-9"
                                        />
                                    </Field>
                                    <Field label="首页排序">
                                        <Input
                                            type="number"
                                            value={homeSort}
                                            onChange={(e) => setHomeSort(Number(e.target.value))}
                                            className="h-9"
                                        />
                                    </Field>
                                </div>
                            </Section>

                            {/* 分类/标签/摘要从主栏搬到这里，主栏只留标题 + 正文 */}
                            <Section title="分类与标签">
                                <div>
                                    <div className="mb-1.5 text-xs text-muted-foreground">
                                        分类（{categoryIds.length} 已选，可多选）
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {categories.length === 0 && <span className="text-xs text-muted-foreground">暂无分类</span>}
                                        {categories.map((c) => {
                                            const on = categoryIds.includes(String(c.id));
                                            return (
                                                <button
                                                    key={c.id}
                                                    type="button"
                                                    onClick={() => toggle(categoryIds, String(c.id), setCategoryIds)}
                                                    aria-pressed={on}
                                                    className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                                                        on ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"
                                                    }`}
                                                >
                                                    {c.name}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                                <div>
                                    <div className="mb-1.5 text-xs text-muted-foreground">
                                        标签（{tagIds.length} 已选，可多选）
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {tags.length === 0 && <span className="text-xs text-muted-foreground">暂无标签</span>}
                                        {tags.map((t) => {
                                            const on = tagIds.includes(String(t.id));
                                            return (
                                                <button
                                                    key={t.id}
                                                    type="button"
                                                    onClick={() => toggle(tagIds, String(t.id), setTagIds)}
                                                    aria-pressed={on}
                                                    className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                                                        on ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"
                                                    }`}
                                                >
                                                    {t.name}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </Section>

                            <Section title="摘要">
                                <textarea
                                    id="article-summary"
                                    value={summary}
                                    onChange={(e) => setSummary(e.target.value)}
                                    rows={3}
                                    placeholder="列表页/首页展示用的摘要（一行一条）"
                                    className="w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring"
                                />
                            </Section>

                            <Section title="封面">
                                <ImageField label="封面图" value={coverUrl} onChange={setCoverUrl} />
                                <ImageField label="首页大图（可选）" value={topImgUrl} onChange={setTopImgUrl} />
                            </Section>

                            <Section title="外观">
                                <Field label="主色" hint="（用于文章卡片/背景渐变）">
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="color"
                                            value={/^#[0-9a-fA-F]{6}$/.test(primaryColor) ? primaryColor : "#059669"}
                                            onChange={(e) => {
                                                setPrimaryColor(e.target.value);
                                                setColorManual(true);
                                            }}
                                            aria-label="选择主色"
                                            className="size-9 shrink-0 cursor-pointer rounded-md border bg-transparent"
                                        />
                                        <Input
                                            value={primaryColor}
                                            onChange={(e) => setPrimaryColor(e.target.value)}
                                            placeholder="#059669"
                                            className="h-9 font-mono"
                                        />
                                    </div>
                                </Field>
                                <label className="flex items-center gap-2 text-sm">
                                    <input
                                        type="checkbox"
                                        checked={colorManual}
                                        onChange={(e) => setColorManual(e.target.checked)}
                                        className="size-4 accent-primary"
                                    />
                                    手动指定（不自动从封面取色）
                                </label>
                            </Section>

                            <Section title="原创与版权">
                                <label className="flex items-center gap-2 text-sm">
                                    <input
                                        type="checkbox"
                                        checked={isReprint}
                                        onChange={(e) => setIsReprint(e.target.checked)}
                                        className="size-4 accent-primary"
                                    />
                                    转载文章
                                </label>
                                <label className="flex items-center gap-2 text-sm">
                                    <input
                                        type="checkbox"
                                        checked={copyright}
                                        onChange={(e) => setCopyright(e.target.checked)}
                                        className="size-4 accent-primary"
                                    />
                                    显示版权声明
                                </label>
                                {isReprint && (
                                    <>
                                        <Field label="原作者">
                                            <Input value={copyrightAuthor} onChange={(e) => setCopyrightAuthor(e.target.value)} className="h-9" />
                                        </Field>
                                        <Field label="原作者链接">
                                            <Input
                                                value={copyrightAuthorHref}
                                                onChange={(e) => setCopyrightAuthorHref(e.target.value)}
                                                placeholder="https://"
                                                className="h-9"
                                            />
                                        </Field>
                                        <Field label="原文链接">
                                            <Input
                                                value={copyrightUrl}
                                                onChange={(e) => setCopyrightUrl(e.target.value)}
                                                placeholder="https://"
                                                className="h-9"
                                            />
                                        </Field>
                                    </>
                                )}
                            </Section>

                            <Section title="SEO 与链接">
                                <Field label="关键词" hint="（英文逗号分隔）">
                                    <Input value={keywords} onChange={(e) => setKeywords(e.target.value)} className="h-9" />
                                </Field>
                                <Field label="自定义链接" hint="（留空用默认）">
                                    <Input
                                        value={abbrlink}
                                        onChange={(e) => setAbbrlink(e.target.value)}
                                        placeholder="my-post-1"
                                        className="h-9 font-mono"
                                    />
                                </Field>
                            </Section>

                            <Section title="其它">
                                <Field label="IP 归属地">
                                    <Input value={ipLocation} onChange={(e) => setIpLocation(e.target.value)} className="h-9" />
                                </Field>
                            </Section>
                        </aside>
                    </div>
                </div>
            </div>
        </div>
    );
}
