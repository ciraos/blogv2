"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "nextjs-toploader/app";
import {
    ArrowLeft,
    CalendarDays,
    ChevronDown,
    Code2,
    Eye,
    History,
    ImagePlus,
    Info,
    Loader2,
    Plus,
    Save,
    Send,
    Settings2,
    WandSparkles,
    X,
} from "lucide-react";
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
 * 布局：顶栏（返回 + 标题 + 存草稿/发布）+ 主编辑区 + 右侧设置栏（320px，窄屏折到下方、可由顶部按钮收起）。
 *  - 高度：lg 下整格锁成滚动容器高度（grid lg:h-full），左栏正文块撑满剩余高度（编辑器内部滚），
 *    右栏设置项自己滚（lg:overflow-y-auto）——避免右栏更长时把左栏拖出一大片空白。
 *  - 右栏：两个 Tab（文章设置 / SEO 分析），下面是状态按钮行 + 一组可折叠卡片（SettingCard）。
 *    卡片顺序：发布时间 / 基础 / 摘要 & SEO / 显示 / 会员权限 / 全文隐藏 / 高级。
 *    后端没有对应字段的项目（定时、自定义发布日期、会员可见、全文隐藏、单章 JS、文档模式）
 *    一律不做假输入框：禁用 + 灰字说明为什么（NotSupportedNote）。
 * 设置项（可提交）：状态、分类/标签、封面与顶部大图（走 /api/admin/articles/upload）、摘要、关键词/永久链接、
 *        首页展示与排序、主色、原创与版权、IP 属地。
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

/**
 * 右栏可折叠卡片（对齐官方文章编辑页右栏）：卡头一行「标题（+ 徽标）+ 折叠箭头」，卡体默认展开。
 * 折叠状态自己维护（useState），收起时只留卡头。
 */
function SettingCard({
    title,
    children,
}: {
    title: string;
    children: React.ReactNode;
}) {
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

/** PRO 徽标（与后台 AI 设置面板同一套琥珀色系） */
function ProBadge() {
    return (
        <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-amber-600 dark:text-amber-400">
            PRO
        </span>
    );
}

/** 「后端没有这个字段」的如实说明：不造假输入框，只讲清楚为什么禁用 */
function NotSupportedNote({ children }: { children: React.ReactNode }) {
    return (
        <p className="flex items-start gap-1.5 rounded-md border border-dashed px-2 py-1.5 text-[11px] leading-relaxed text-muted-foreground">
            <Info className="mt-0.5 size-3 shrink-0" aria-hidden />
            <span>{children}</span>
        </p>
    );
}

/** 开关行：左侧「标题 + 小字说明」，右侧开关（与后台其它页面同一套 peer 实现） */
function SwitchRow({
    label,
    description,
    checked,
    onChange,
    disabled,
}: {
    label: string;
    description?: string;
    checked: boolean;
    /** 禁用态可以不传（后端没有对应字段时只做展示） */
    onChange?: (v: boolean) => void;
    disabled?: boolean;
}) {
    return (
        <label className={`flex items-center justify-between gap-3 ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}>
            <span className="min-w-0 text-xs leading-snug">
                <span className={`block font-medium ${disabled ? "text-muted-foreground" : "text-foreground"}`}>{label}</span>
                {description && <span className="mt-0.5 block text-[11px] text-muted-foreground/80">{description}</span>}
            </span>
            <span className="relative inline-flex h-5 w-9 shrink-0 items-center">
                <input
                    type="checkbox"
                    role="switch"
                    aria-label={label}
                    checked={checked}
                    disabled={disabled}
                    onChange={(e) => onChange?.(e.target.checked)}
                    className="peer sr-only"
                />
                <span
                    aria-hidden
                    className="absolute inset-0 rounded-full bg-input transition-colors peer-checked:bg-primary peer-disabled:opacity-60"
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
 * 状态按钮行（官方右栏版式）：发布 / 草稿 / 定时 / 归档。
 * 只有发布/草稿/归档是现有提交载荷（AdminArticlePayload.status）真正支持的枚举值；
 * 「定时」还要求时间字段（scheduled_at / custom_published_at），载荷里没有声明，
 * 所以按本项目一贯的「诚实呈现」做成禁用 + tooltip，不凭空造输入框。
 */
const STATUS_OPTIONS: {
    key: string;
    value: Status | null;
    label: string;
    activeCls: string;
    disabled?: boolean;
    title?: string;
}[] = [
    {
        key: "published",
        value: "PUBLISHED",
        label: "发布",
        activeCls: "border-emerald-500/60 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
        title: "把状态设为「已发布」（真正提交还是走顶栏的「发布」按钮）",
    },
    {
        key: "draft",
        value: "DRAFT",
        label: "草稿",
        activeCls: "border-amber-500/60 bg-amber-500/10 text-amber-600 dark:text-amber-400",
        title: "把状态设为「草稿」（真正提交还是走顶栏的「存草稿」按钮）",
    },
    {
        key: "scheduled",
        value: null,
        label: "定时",
        activeCls: "",
        disabled: true,
        title: "后端 status 有 SCHEDULED，但定时时间字段（scheduled_at / custom_published_at）不在前端提交载荷里，暂不可用",
    },
    {
        key: "archived",
        value: "ARCHIVED",
        label: "归档",
        activeCls: "border-border bg-muted text-foreground",
        title: "把状态设为「已归档」",
    },
];

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

/** 图片字段（官方右栏版式）：左侧缩略图预览 + 右侧「路径输入 + 上传按钮」，有值时缩略图上可移除 */
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
            <div className="flex items-center gap-2">
                <div className="relative h-14 w-20 shrink-0 overflow-hidden rounded-md border bg-muted/30">
                    {value ? (
                        <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={value} alt={label} className="size-full object-cover" />
                            <button
                                type="button"
                                onClick={() => onChange("")}
                                aria-label={`移除${label}`}
                                className="absolute right-0.5 top-0.5 rounded-full bg-background/85 p-0.5 text-muted-foreground backdrop-blur transition-colors hover:text-destructive"
                            >
                                <X className="size-3" />
                            </button>
                        </>
                    ) : (
                        <span className="flex size-full items-center justify-center text-muted-foreground">
                            {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <ImagePlus className="size-3.5" aria-hidden />}
                        </span>
                    )}
                </div>
                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                    <Input
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        placeholder="图片地址，或点右侧上传"
                        className="h-9 min-w-0 flex-1 text-xs"
                    />
                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="size-9 shrink-0"
                        onClick={() => inputRef.current?.click()}
                        disabled={uploading}
                        title={`上传${label}`}
                        aria-label={`上传${label}`}
                    >
                        {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <ImagePlus className="size-3.5" />}
                    </Button>
                </div>
            </div>
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
    /** 右栏两个 Tab：文章设置 / SEO 分析（官方右栏版式） */
    const [settingsTab, setSettingsTab] = useState<"settings" | "seo">("settings");
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

    /** 分类/标签共用：已选则移除、未选则追加（下拉添加与标签上的 × 都走它） */
    const toggle = (list: string[], id: string, set: (v: string[]) => void) =>
        set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

    /** 「+ 添加摘要」：摘要一行一条，这里只是新起一行（载荷仍是 summaries: string[]，语义不变） */
    const addSummary = () => setSummary((s) => `${s.replace(/\s+$/, "")}\n`);

    /** 「取正文前 300 字」：把正文压成纯文本后截 300 字填进摘要（只是帮用户填表，内容仍可手改） */
    const fillSummaryFromContent = () => {
        const plain = contentMd
            .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
            .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
            .replace(/[#>*`_~|-]+/g, " ")
            .replace(/\s+/g, " ")
            .trim();
        if (!plain) {
            toast.error("正文还是空的，取不到摘要");
            return;
        }
        setSummary(plain.slice(0, 300));
    };

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
                    {/* 设置栏收起时，主编辑区直接吃掉整行宽度。
                        lg 下整格锁定成滚动容器的高度（lg:h-full）：
                        否则行高由更高的右栏决定，左栏（标题 + 正文）被拉到底也填不满，
                        编辑器下方就会留出一大片空白。锁定高度后，长内容交给右栏自己滚。 */}
                    <div
                        className={`grid grid-cols-1 gap-5 p-4 sm:p-5 lg:h-full ${
                            showSettings ? "lg:grid-cols-[minmax(0,1fr)_320px]" : ""
                        }`}
                    >
                        {/* ============ 主编辑区 ============ */}
                        <div className="flex min-w-0 flex-col gap-5 lg:min-h-0">
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

                            {/* 正文块：吃掉左栏剩余高度（min-h-0 允许被压，内部再交给编辑器/预览滚动） */}
                            <div className="flex min-h-0 flex-1 flex-col">
                                <div className="mb-1.5 flex shrink-0 items-center justify-between gap-2">
                                    <span className="text-xs font-medium text-muted-foreground">正文（Markdown）</span>
                                    <Button variant="outline" size="sm" className="h-7" onClick={() => setShowPreview((v) => !v)}>
                                        {showPreview ? <Code2 className="size-3.5" /> : <Eye className="size-3.5" />}
                                        {showPreview ? "继续编辑" : "预览"}
                                    </Button>
                                </div>
                                {showPreview ? (
                                    // 前台样式预览：封面 + 标题 + 分类/标签 + 正文排版（.article-body 与前台同一套样式）
                                    // 撑满剩余高度，正文超出时在这个容器里滚（不再把整页拉长）
                                    <div className="min-h-[420px] flex-1 overflow-auto rounded-md border bg-card">
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
                                    // 编辑器容器：撑满正文块剩余高度（保底 420px，不会比原来更小）。
                                    // -mb-1（-4px）：MarkdownEditor 内部那把「按 .admin-scroll 可见高度 − 工具条 − 16px」
                                    // 的自适应算法扣的留白比卡片内边距（sm:p-5 = 20px）少 4px，这里补掉，
                                    // 免得撑满后底部 4px 溢出被裁 / 压到工具条上；宽度 <sm 时是 p-4（16px），只会多出 4px 余量。
                                    <div className="-mb-1 flex min-h-[420px] flex-1 flex-col">
                                        <MarkdownEditor
                                            value={contentMd}
                                            onChange={setContentMd}
                                            placeholder={"## 小标题\n\n正文用 Markdown 写，工具栏可插入加粗/代码/表格；支持直接 Ctrl+V 粘贴截图自动上传"}
                                        />
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* ============ 右侧设置栏（可收起，收起后编辑器占满整宽） ============ */}
                        {/* lg 下和左栏一样锁成滚动容器高度，并且自己滚：
                            这样设置项再长也只滚右栏，不会把左栏（正文）拖出一片空白 */}
                        <aside
                            className={`flex-col gap-3 lg:h-full lg:min-h-0 lg:overflow-y-auto ${
                                showSettings ? "flex" : "hidden"
                            }`}
                        >
                            {/* ===== 右栏 Tab：文章设置 / SEO 分析 ===== */}
                            <div className="flex shrink-0 gap-1 rounded-lg border bg-muted/40 p-0.5" role="tablist" aria-label="右栏分区">
                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={settingsTab === "settings"}
                                    onClick={() => setSettingsTab("settings")}
                                    className={`flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                                        settingsTab === "settings" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                                    }`}
                                >
                                    文章设置
                                </button>
                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={settingsTab === "seo"}
                                    onClick={() => setSettingsTab("seo")}
                                    className={`flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                                        settingsTab === "seo" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                                    }`}
                                >
                                    SEO 分析
                                </button>
                            </div>

                            {settingsTab === "seo" ? (
                                // SEO 分析：沿用原来的发布前自检面板（评分 / 检查项 / 证据）
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
                            ) : (
                                <>
                                    {/* 状态按钮行：只切状态；真正提交还是走顶栏的「存草稿 / 发布」 */}
                                    <div className="grid shrink-0 grid-cols-4 gap-1.5" role="group" aria-label="文章状态">
                                        {STATUS_OPTIONS.map((opt) => {
                                            const on = opt.value !== null && status === opt.value;
                                            return (
                                                <button
                                                    key={opt.key}
                                                    type="button"
                                                    aria-pressed={on}
                                                    disabled={opt.disabled}
                                                    title={opt.title}
                                                    onClick={() => {
                                                        if (opt.value) setStatus(opt.value);
                                                    }}
                                                    className={`h-8 rounded-md border text-xs font-medium transition-colors ${
                                                        on ? opt.activeCls : "border-input text-muted-foreground hover:bg-muted"
                                                    } ${opt.disabled ? "cursor-not-allowed opacity-50" : ""}`}
                                                >
                                                    {opt.label}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {/* 发布时间：后端有 custom_published_at / scheduled_at，载荷没声明 → 禁用呈现不造假输入 */}
                                    <SettingCard title="发布时间">
                                        <Field label="自定义发布日期">
                                            <div className="relative">
                                                <Input type="datetime-local" value="" readOnly disabled className="h-9 pl-8" />
                                                <CalendarDays
                                                    className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                                                    aria-hidden
                                                />
                                            </div>
                                        </Field>
                                        <p className="text-[11px] leading-relaxed text-muted-foreground">
                                            用于前台列表、归档与排序的发布日期（对应文章创建时间）；留空则使用保存时的当前时间。
                                        </p>
                                        <NotSupportedNote>
                                            后端有 custom_published_at / scheduled_at（status 也支持 SCHEDULED），但前端提交载荷 AdminArticlePayload
                                            里没声明这些字段（要先扩 src/lib/api.ts），所以本卡与上面的「定时」按钮都只做禁用呈现，不提交无效数据。
                                        </NotSupportedNote>
                                    </SettingCard>

                                    {/* 基础：分类 / 标签（下拉 + 可删标签）/ 封面与顶部大图 / 转载与版权 */}
                                    <SettingCard title="基础">
                                        <div>
                                            <div className="mb-1 flex items-center justify-between">
                                                <span className="text-xs text-muted-foreground">分类</span>
                                                <span className="text-[11px] text-muted-foreground/70">{categoryIds.length} 已选</span>
                                            </div>
                                            <select
                                                value=""
                                                aria-label="选择分类"
                                                onChange={(e) => e.target.value && toggle(categoryIds, e.target.value, setCategoryIds)}
                                                className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring"
                                            >
                                                <option value="">选择分类…</option>
                                                {categories.map((c) => {
                                                    const id = String(c.id);
                                                    return (
                                                        <option key={c.id} value={id} disabled={categoryIds.includes(id)}>
                                                            {c.name}
                                                        </option>
                                                    );
                                                })}
                                            </select>
                                            {categories.length === 0 && (
                                                <p className="mt-1 text-[11px] text-muted-foreground/70">后台还没有分类</p>
                                            )}
                                            {categoryIds.length > 0 && (
                                                <div className="mt-1.5 flex flex-wrap gap-1.5">
                                                    {categoryIds.map((id) => (
                                                        <span
                                                            key={id}
                                                            className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[11px] text-primary"
                                                        >
                                                            {categories.find((c) => String(c.id) === id)?.name ?? id}
                                                            <button
                                                                type="button"
                                                                aria-label="移除该分类"
                                                                onClick={() => toggle(categoryIds, id, setCategoryIds)}
                                                                className="text-primary/70 transition-colors hover:text-destructive"
                                                            >
                                                                <X className="size-3" />
                                                            </button>
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        <div>
                                            <div className="mb-1 flex items-center justify-between">
                                                <span className="text-xs text-muted-foreground">标签</span>
                                                <span className="text-[11px] text-muted-foreground/70">{tagIds.length} 已选</span>
                                            </div>
                                            <select
                                                value=""
                                                aria-label="选择标签"
                                                onChange={(e) => e.target.value && toggle(tagIds, e.target.value, setTagIds)}
                                                className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring"
                                            >
                                                <option value="">选择标签…</option>
                                                {tags.map((t) => {
                                                    const id = String(t.id);
                                                    return (
                                                        <option key={t.id} value={id} disabled={tagIds.includes(id)}>
                                                            {t.name}
                                                        </option>
                                                    );
                                                })}
                                            </select>
                                            {tags.length === 0 && (
                                                <p className="mt-1 text-[11px] text-muted-foreground/70">后台还没有标签</p>
                                            )}
                                            {tagIds.length > 0 && (
                                                <div className="mt-1.5 flex flex-wrap gap-1.5">
                                                    {tagIds.map((id) => (
                                                        <span
                                                            key={id}
                                                            className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[11px] text-primary"
                                                        >
                                                            {tags.find((t) => String(t.id) === id)?.name ?? id}
                                                            <button
                                                                type="button"
                                                                aria-label="移除该标签"
                                                                onClick={() => toggle(tagIds, id, setTagIds)}
                                                                className="text-primary/70 transition-colors hover:text-destructive"
                                                            >
                                                                <X className="size-3" />
                                                            </button>
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        <ImageField label="封面图" value={coverUrl} onChange={setCoverUrl} />
                                        <ImageField label="顶部大图（可选）" value={topImgUrl} onChange={setTopImgUrl} />
                                        <SwitchRow
                                            label="转载文章"
                                            description="开启后显示版权来源"
                                            checked={isReprint}
                                            onChange={setIsReprint}
                                        />
                                        <SwitchRow label="显示版权声明" checked={copyright} onChange={setCopyright} />
                                        {isReprint && (
                                            <>
                                                <Field label="原作者">
                                                    <Input
                                                        value={copyrightAuthor}
                                                        onChange={(e) => setCopyrightAuthor(e.target.value)}
                                                        className="h-9"
                                                    />
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
                                    </SettingCard>

                                    {/* 摘要 & SEO：摘要多行 + 取正文/添加一条 + 关键词 + 永久链接 */}
                                    <SettingCard title="摘要 & SEO">
                                        <div>
                                            <div className="mb-1 flex items-center justify-between">
                                                <span className="text-xs text-muted-foreground">摘要</span>
                                                <span className="text-[11px] text-muted-foreground/70">一行一条</span>
                                            </div>
                                            <p className="mb-2 text-[11px] leading-relaxed text-muted-foreground">
                                                可手动填写，或使用下方工具从正文取前 300 字。PRO 最多 3 条，前台随机展示其中一条，读者可切换。
                                            </p>
                                            <div className="mb-2 grid grid-cols-2 gap-1.5">
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-8 px-2 text-[11px]"
                                                    onClick={fillSummaryFromContent}
                                                >
                                                    取正文前 300 字
                                                </Button>
                                                {/* 摘要接口未确认存在（api-ai.ts 记录 /api/pro/admin/ai/summary 系列探测全是 404）：
                                                    按「诚实呈现」做成禁用 + PRO 徽标，不发请求 */}
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-8 gap-1 px-2 text-[11px]"
                                                    disabled
                                                    title="后端未提供摘要接口（探测 /api/pro/admin/ai/summary 为 404），本按钮不会发请求"
                                                >
                                                    <WandSparkles className="size-3.5" />
                                                    AI 生成摘要
                                                    <ProBadge />
                                                </Button>
                                            </div>
                                            <textarea
                                                id="article-summary"
                                                value={summary}
                                                onChange={(e) => setSummary(e.target.value)}
                                                rows={4}
                                                placeholder="一行一条，留空则前台按正文自动截取"
                                                className="w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-xs outline-none focus-visible:border-ring"
                                            />
                                            <button
                                                type="button"
                                                onClick={addSummary}
                                                className="mt-1.5 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-primary"
                                            >
                                                <Plus className="size-3.5" />
                                                添加摘要
                                            </button>
                                        </div>
                                        <Field label="关键词" hint="（英文逗号分隔）">
                                            <Input
                                                value={keywords}
                                                onChange={(e) => setKeywords(e.target.value)}
                                                placeholder="用英文逗号分隔"
                                                className="h-9"
                                            />
                                        </Field>
                                        <Field label="永久链接" hint="（留空自动生成）">
                                            <Input
                                                value={abbrlink}
                                                onChange={(e) => setAbbrlink(e.target.value)}
                                                placeholder="自动生成或手动输入"
                                                className="h-9 font-mono"
                                            />
                                        </Field>
                                    </SettingCard>

                                    {/* 显示：首页展示 / 排序 / 手动主色调（取色器与十六进制仍保留原能力） */}
                                    <SettingCard title="显示">
                                        <SwitchRow
                                            label="首页展示"
                                            description="关闭后只在归档、分类等列表里出现"
                                            checked={showOnHome}
                                            onChange={setShowOnHome}
                                        />
                                        <div className="grid grid-cols-2 gap-3">
                                            <Field label="首页排序">
                                                <Input
                                                    type="number"
                                                    value={homeSort}
                                                    onChange={(e) => setHomeSort(Number(e.target.value))}
                                                    className="h-9"
                                                />
                                            </Field>
                                            <Field label="置顶排序">
                                                <Input
                                                    type="number"
                                                    value={pinSort}
                                                    onChange={(e) => setPinSort(Number(e.target.value))}
                                                    className="h-9"
                                                />
                                            </Field>
                                        </div>
                                        <SwitchRow
                                            label="手动主色调"
                                            description="覆盖从封面自动提取的颜色"
                                            checked={colorManual}
                                            onChange={setColorManual}
                                        />
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
                                    </SettingCard>

                                    {/* 会员权限 / 全文隐藏：后端文章模型里没有对应字段 → 只做禁用 + 说明 */}
                                    <SettingCard title="会员权限">
                                        <SwitchRow
                                            label="整篇会员可见"
                                            description="未达指定等级的用户只能看到摘要和升级提示"
                                            checked={false}
                                            disabled
                                        />
                                        <NotSupportedNote>
                                            后端的文章模型（model.CreateArticleRequest / model.ArticleExtraConfig）里没有会员可见性或所需等级字段，
                                            前端载荷 AdminArticlePayload 也没有，所以本卡是禁用呈现，等后端补字段后再接入。
                                        </NotSupportedNote>
                                    </SettingCard>

                                    <SettingCard title="全文隐藏">
                                        <SwitchRow
                                            label="启用全文隐藏"
                                            description="用户需要输入密码才能查看完整文章"
                                            checked={false}
                                            disabled
                                        />
                                        <NotSupportedNote>
                                            后端只有账号体系的 password 字段，文章模型里没有「文章密码 / 全文隐藏」字段，本卡为禁用呈现。
                                        </NotSupportedNote>
                                    </SettingCard>

                                    {/* 高级：IP 属地可直接提交；自定义 JS / 文档模式的字段后端有、载荷没声明 */}
                                    <SettingCard title="高级">
                                        <Field label="IP 属地">
                                            <Input
                                                value={ipLocation}
                                                onChange={(e) => setIpLocation(e.target.value)}
                                                placeholder="如：广东"
                                                className="h-9"
                                            />
                                        </Field>
                                        <div>
                                            <span className="mb-1 block text-xs text-muted-foreground">单章自定义 JS（仅管理员）</span>
                                            <textarea
                                                rows={3}
                                                value=""
                                                disabled
                                                readOnly
                                                placeholder="仅管理员可用。填写后会在该文章的详情页执行。"
                                                className="w-full resize-y rounded-md border border-input bg-muted/40 px-3 py-2 font-mono text-xs outline-none"
                                            />
                                            <div className="mt-1.5">
                                                <NotSupportedNote>
                                                    后端字段是 extra_config.custom_js，但前端载荷没声明 extra_config，本次不提交、只做禁用呈现。
                                                </NotSupportedNote>
                                            </div>
                                        </div>
                                        <div>
                                            <SwitchRow label="文档模式" description="作为系列文档的一部分" checked={false} disabled />
                                            <div className="mt-1.5">
                                                <NotSupportedNote>
                                                    后端有 is_doc / doc_series_id / doc_sort，但前端载荷未声明，本项禁用。
                                                </NotSupportedNote>
                                            </div>
                                        </div>
                                    </SettingCard>
                                </>
                            )}
                        </aside>
                    </div>
                </div>
            </div>
        </div>
    );
}
