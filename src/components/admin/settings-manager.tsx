"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
    ArrowDown,
    ArrowUp,
    ChevronRight,
    ImageIcon,
    Loader2,
    Menu,
    Plus,
    RotateCcw,
    Save,
    Search,
    Trash2,
    Upload,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
    ALL_SETTINGS_FIELDS,
    APPEARANCE_SKIN_KEY,
    SETTINGS_GROUP_ORDER,
    SETTINGS_SECTIONS,
    SKIN_OPTIONS,
    buildSettingsBaseline,
    buildSettingsPayload,
    isFieldDirty,
    skinPreviewColor,
    type AppearanceTokenBranches,
    type SettingsField,
    type SettingsFormValue,
    type SettingsGroup,
    type SettingsListField,
    type SettingsSection,
} from "@/lib/admin-settings";
import { TokenColorEditor } from "@/components/admin/token-color-editor";
import { updateAdminSettingsApi, uploadAdminImageApi } from "@/lib/api";
import { broadcastSiteConfigUpdate } from "@/lib/site-config-broadcast";
import { uploadFileToFileManager } from "@/lib/admin-file-upload";
import type { SiteConfig } from "@/types/site-config";
import { cn, resolveAssetUrl, toSameOriginMediaUrl } from "@/lib/utils";

type Draft = Record<string, SettingsFormValue>;

/** 搜索结果：定位到某个分区（分组/字段名也参与匹配） */
interface SettingsSearchHit {
    key: string;
    sectionId: string;
    sectionLabel: string;
    groupLabel: string;
    label: string;
}

/**
 * 后台系统设置：站点信息 / Logo 与图标 / 外观 / 页脚。
 *
 * 首屏值来自服务端取的 /public/site-config；保存时只提交改动项
 * （POST /api/admin/settings/update → 远端 /settings/update），保存后 router.refresh() 让
 * 服务端重新取配置，页面与前台立刻用上新值。
 * 另外向同一浏览器的其它标签页广播本次改动的键（broadcastSiteConfigUpdate）：
 * 已经打开的前台页面据此自动整页刷新或重取配置，不用用户手动按刷新。
 */
export function SettingsManager({ config }: { config: SiteConfig }) {
    const router = useRouter();
    const initial = useMemo(() => buildSettingsBaseline(config), [config]);
    const initialKey = useMemo(() => JSON.stringify(initial), [initial]);

    const [baseline, setBaseline] = useState<Draft>(initial);
    const [draft, setDraft] = useState<Draft>(initial);
    const [syncKey, setSyncKey] = useState(initialKey);
    const [saving, setSaving] = useState(false);
    // 分区用受控 state：保存后的 router.refresh() 不会把标签页重置回第一个
    const [tab, setTab] = useState(SETTINGS_SECTIONS[0].id);
    const [search, setSearch] = useState("");
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);

    // 服务端配置变化（router.refresh 之后）→ 渲染期对齐基线，避免在 effect 里同步 setState
    if (syncKey !== initialKey) {
        setSyncKey(initialKey);
        setBaseline(initial);
        setDraft(initial);
    }

    const dirtyFields = useMemo(
        () => ALL_SETTINGS_FIELDS.filter((field) => isFieldDirty(field, draft, baseline)),
        [draft, baseline]
    );
    const dirtyKeys = useMemo(() => new Set(dirtyFields.map((field) => field.key)), [dirtyFields]);
    const activeSection = SETTINGS_SECTIONS.find((section) => section.id === tab) ?? SETTINGS_SECTIONS[0];

    const setValue = (key: string, value: SettingsFormValue) => setDraft((prev) => ({ ...prev, [key]: value }));

    const handleSave = useCallback(async () => {
        if (dirtyFields.length === 0) {
            toast.warning("没有需要保存的更改");
            return;
        }
        const name = draft.APP_NAME;
        if (dirtyFields.some((f) => f.key === "APP_NAME") && String(name ?? "").trim() === "") {
            toast.error("站点名称不能为空");
            return;
        }
        const siteUrl = String(draft.SITE_URL ?? "").trim();
        if (dirtyFields.some((f) => f.key === "SITE_URL") && siteUrl !== "" && !/^https?:\/\//i.test(siteUrl)) {
            toast.error("站点地址需要以 http:// 或 https:// 开头");
            return;
        }

        const payload = buildSettingsPayload(dirtyFields, draft);
        setSaving(true);
        try {
            await updateAdminSettingsApi(payload);
            // 广播本次改动的键：同一浏览器里已打开的前台标签页据此自动刷新
            // （影响整站外观的键整页 reload，其余只重取配置；见 lib/site-config-broadcast.ts）
            broadcastSiteConfigUpdate(Object.keys(payload));
            toast.success(`已保存 ${Object.keys(payload).length} 项设置`);
            setBaseline(draft);
            router.refresh();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "保存失败");
        } finally {
            setSaving(false);
        }
    }, [dirtyFields, draft, router]);

    const handleReset = useCallback(() => {
        setDraft(baseline);
        toast.info("已还原为当前生效的设置");
    }, [baseline]);

    /** 只还原当前分区的改动（对齐官方「重置当前」） */
    const handleResetCurrent = () => {
        const keys = new Set(activeSection.groups.flatMap((group) => group.fields).map((field) => field.key));
        setDraft((prev) => {
            const next = { ...prev };
            for (const key of keys) next[key] = baseline[key];
            return next;
        });
        toast.info(`已还原「${activeSection.label}」的改动`);
    };

    const sectionDirtyCount = activeSection.groups
        .flatMap((group) => group.fields)
        .filter((field) => isFieldDirty(field, draft, baseline)).length;

    /** 搜索：分区名/关键词、分组名、字段名都参与匹配 */
    const searchHits = useMemo<SettingsSearchHit[]>(() => {
        const keyword = search.trim().toLowerCase();
        if (!keyword) return [];
        const hits: SettingsSearchHit[] = [];
        for (const section of SETTINGS_SECTIONS) {
            if (section.label.toLowerCase().includes(keyword) || (section.keywords ?? []).some((k) => k.toLowerCase().includes(keyword))) {
                hits.push({
                    key: `s:${section.id}`,
                    sectionId: section.id,
                    sectionLabel: "设置分区",
                    groupLabel: section.label,
                    label: section.label,
                });
                continue;
            }
            for (const group of section.groups) {
                if (group.label.toLowerCase().includes(keyword)) {
                    hits.push({
                        key: `g:${section.id}:${group.id}`,
                        sectionId: section.id,
                        sectionLabel: section.label,
                        groupLabel: "分组",
                        label: group.label,
                    });
                    continue;
                }
                for (const field of group.fields) {
                    if (field.label.toLowerCase().includes(keyword) || field.key.toLowerCase().includes(keyword)) {
                        hits.push({
                            key: `f:${field.key}`,
                            sectionId: section.id,
                            sectionLabel: section.label,
                            groupLabel: group.label,
                            label: field.label,
                        });
                    }
                }
            }
        }
        return hits.slice(0, 12);
    }, [search]);

    const goToSection = (sectionId: string) => {
        setTab(sectionId);
        setSearch("");
        setMobileNavOpen(false);
        contentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    // Ctrl / ⌘ + S 保存（对齐全台官方后台）
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
                event.preventDefault();
                if (dirtyFields.length > 0 && !saving) void handleSave();
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [dirtyFields.length, saving, handleSave]);

    /** 左侧导航按 section.group 聚拢；分组顺序取 SETTINGS_GROUP_ORDER（对齐官方后台的设置导航） */
    const navGroups = useMemo(() => {
        const map = new Map<string, SettingsSection[]>();
        for (const section of SETTINGS_SECTIONS as SettingsSection[]) {
            const list = map.get(section.group);
            if (list) list.push(section);
            else map.set(section.group, [section]);
        }
        // 先按官方顺序输出已列出的分组；schema 里出现但没列进顺序表的补在后面，避免新增分区从导航里消失
        const ordered: string[] = [...SETTINGS_GROUP_ORDER];
        for (const label of map.keys()) if (!ordered.includes(label)) ordered.push(label);
        return ordered.filter((label) => map.has(label)).map((label) => ({ label, sections: map.get(label) ?? [] }));
    }, []);

    /** 左侧导航（桌面栏与移动端抽屉共用） */
    const navList = (
        <nav aria-label="设置分区" className="space-y-0.5">
            {navGroups.map((navGroup, groupIndex) => (
                <div key={navGroup.label} className={groupIndex > 0 ? "pt-4" : ""}>
                    <p className="mb-1 px-3 text-[11px] font-medium tracking-wide text-muted-foreground/60">{navGroup.label}</p>
                    <div className="space-y-0.5">
                        {navGroup.sections.map((section) => {
                            const SectionIcon = section.icon;
                            const active = tab === section.id;
                            const dirty = section.groups.flatMap((g) => g.fields).some((f) => dirtyKeys.has(f.key));
                            return (
                                <button
                                    key={section.id}
                                    type="button"
                                    onClick={() => goToSection(section.id)}
                                    aria-current={active ? "page" : undefined}
                                    className={cn(
                                        "group flex w-full items-center gap-2.5 rounded-full px-3 py-[7px] text-[13px] transition-all duration-150",
                                        active
                                            ? "bg-primary/10 font-medium text-primary"
                                            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                                    )}
                                >
                                    <SectionIcon
                                        className={cn(
                                            "size-4 shrink-0",
                                            active ? "text-primary" : "text-muted-foreground/70 group-hover:text-muted-foreground"
                                        )}
                                    />
                                    <span className="truncate">{section.label}</span>
                                    {dirty && (
                                        <span className="ml-auto size-1.5 shrink-0 rounded-full bg-primary" aria-label="有改动" />
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
            ))}
        </nav>
    );

    /** 搜索框 + 结果下拉 */
    const searchBox = (
        <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索设置…"
                aria-label="搜索设置"
                className="h-9 rounded-full border-border/50 bg-muted/40 pl-8 text-[13px] shadow-none"
            />
            {search.trim() !== "" && (
                <div className="absolute inset-x-0 top-full z-50 mt-1.5 overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm dark:shadow-lg">
                    {searchHits.length > 0 ? (
                        <div className="max-h-80 overflow-y-auto p-1">
                            {searchHits.map((hit) => (
                                <button
                                    key={hit.key}
                                    type="button"
                                    onMouseDown={(e) => {
                                        e.preventDefault();
                                        goToSection(hit.sectionId);
                                    }}
                                    className="w-full rounded-md px-3 py-2 text-left transition-colors hover:bg-muted"
                                >
                                    <div className="text-[11px] text-muted-foreground">
                                        {hit.sectionLabel} · {hit.groupLabel}
                                    </div>
                                    <div className="text-[13px] font-medium text-foreground">{hit.label}</div>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-6 text-[13px] text-muted-foreground">
                            <Search className="mb-1.5 size-5 text-muted-foreground/60" />
                            未找到相关设置
                        </div>
                    )}
                </div>
            )}
        </div>
    );

    return (
        <>
            {/* shrink-0 必须保留：外层在 .dsh-main（flex 列）里是 flex 项，而自己是 overflow 非 visible
                的容器 —— 按 CSS 规范这种项的最小高度会自动算成 0，于是它被压缩到「一屏高」、
                多出来的内容被裁掉且无处可滚（滚轮找不到可滚祖先 → 设置页整页滚不动）。
                禁止压缩后容器按内容撑高，滚动重新交回 admin layout 的 main。
                这里用 overflow-clip 而不是 overflow-hidden：clip 同样按圆角裁剪，但**不构成滚动容器**，
                所以左侧导航的 sticky 仍以 main 为参照系（用 hidden 时以本容器为参照，而它不滚动 → 吸顶失效）。 */}
            <div className="flex shrink-0 overflow-clip rounded-xl border border-border/60 bg-card">
                {/* ===== 左侧导航栏（桌面端）===== */}
                <aside className="hidden w-60 shrink-0 border-r border-border/60 bg-muted/30 lg:block">
                    {/* 外层负责铺满整列（背景/分隔线连续），内层 sticky 跟随滚动 */}
                    <div className="sticky top-4 flex max-h-[calc(100dvh-6rem)] flex-col">
                        <div className="p-3 pb-2">{searchBox}</div>
                        <div className="flex-1 overflow-y-auto px-2 pb-4 pt-2">{navList}</div>
                    </div>
                </aside>

                {/* ===== 右侧内容区 ===== */}
                <div ref={contentRef} className="min-w-0 flex-1 bg-muted/40">
                    <div className="mx-auto max-w-3xl px-8 py-6 max-md:px-4 max-md:py-4">
                        {/* 面包屑 + 标题 + 重置当前 */}
                        <div className="mb-6 flex items-start justify-between gap-3 max-md:mb-5">
                            <div className="min-w-0">
                                <div className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                                    <button
                                        type="button"
                                        onClick={() => setMobileNavOpen(true)}
                                        aria-label="打开设置导航"
                                        className="-ml-1 mr-0.5 flex size-6 items-center justify-center rounded-md transition-colors hover:bg-muted lg:hidden"
                                    >
                                        <Menu className="size-4" />
                                    </button>
                                    <span>系统设置</span>
                                    <ChevronRight className="size-3 text-muted-foreground/50" />
                                    <span className="font-medium text-foreground/70">{activeSection.label}</span>
                                </div>
                                <h1 className="truncate text-xl font-semibold tracking-tight">{activeSection.label}</h1>
                                {activeSection.desc && (
                                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{activeSection.desc}</p>
                                )}
                            </div>
                            <Button
                                variant="secondary"
                                size="sm"
                                className="mt-1 h-8 shrink-0 rounded-lg px-3 text-xs font-medium"
                                disabled={sectionDirtyCount === 0}
                                title="撤销当前分区的未保存更改"
                                onClick={handleResetCurrent}
                            >
                                <RotateCcw className="size-3.5" />
                                重置当前
                            </Button>
                        </div>

                        {/* 分组卡片 */}
                        <div className="space-y-5">
                            {activeSection.groups.map((group) => (
                                <SettingsGroupCard
                                    key={group.id}
                                    group={group}
                                    draft={draft}
                                    baseline={baseline}
                                    onChange={setValue}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* ===== 移动端导航抽屉 ===== */}
            <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
                <SheetContent side="left" className="w-72 gap-0 p-0">
                    <SheetHeader className="border-b border-border/40">
                        <SheetTitle className="text-sm font-semibold">设置导航</SheetTitle>
                        <SheetDescription className="sr-only">选择要编辑的设置分区</SheetDescription>
                    </SheetHeader>
                    <div className="p-3">{searchBox}</div>
                    <div className="flex-1 overflow-y-auto px-2 pb-4">{navList}</div>
                </SheetContent>
            </Sheet>

            {/* ===== 未保存更改浮层：只在有改动时出现在右下角 ===== */}
            {dirtyFields.length > 0 && (
                <div
                    role="status"
                    className="fixed bottom-6 right-6 z-50 flex items-center gap-4 rounded-full border border-border/60 bg-background/90 px-5 py-3 shadow-sm backdrop-blur-lg max-md:bottom-4 max-md:left-4 max-md:right-4 max-md:gap-3 max-md:rounded-xl max-md:px-4 max-sm:bottom-3 max-sm:left-3 max-sm:right-3"
                >
                    <span className="whitespace-nowrap text-sm text-muted-foreground">
                        有未保存的更改
                        <span className="ml-1.5 rounded bg-muted px-1.5 py-px text-[11px] text-foreground/70">
                            {dirtyFields.length} 项
                        </span>
                    </span>
                    <span className="ml-auto flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8 rounded-lg px-3 text-xs"
                            disabled={saving}
                            onClick={handleReset}
                        >
                            <RotateCcw className="size-3.5" />
                            还原
                        </Button>
                        <Button
                            size="sm"
                            className="h-8 gap-1.5 rounded-lg px-3 text-xs shadow-lg shadow-primary/20"
                            disabled={saving}
                            onClick={() => void handleSave()}
                        >
                            {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                            {saving ? "保存中…" : "保存设置"}
                        </Button>
                    </span>
                    {/* 快捷键提示（Mac 用 ⌘，统一显示 Ctrl 以免水合不一致） */}
                    <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex" title="Ctrl / ⌘ + S 保存">
                        <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border/60 bg-muted px-1.5 font-sans text-[11px]">
                            Ctrl
                        </kbd>
                        <span>+</span>
                        <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border/60 bg-muted px-1.5 font-sans text-[11px]">
                            S
                        </kbd>
                    </span>
                </div>
            )}
        </>
    );
}

/** 一组设置项（卡片） */
function SettingsGroupCard({
    group,
    draft,
    baseline,
    onChange,
}: {
    group: SettingsGroup;
    draft: Draft;
    baseline: Draft;
    onChange: (key: string, value: SettingsFormValue) => void;
}) {
    const dirtyCount = group.fields.filter((field) => isFieldDirty(field, draft, baseline)).length;
    const [open, setOpen] = useState(true);

    return (
        <section className="rounded-xl border border-border/60 bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] dark:shadow-none">
            <header className={cn("flex items-center gap-2", open && "mb-4 border-b border-border/40 pb-3")}>
                <button
                    type="button"
                    onClick={() => setOpen((prev) => !prev)}
                    aria-expanded={open}
                    className="-mx-1 flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-0.5 text-left transition-colors hover:bg-muted/50"
                >
                    <ChevronRight
                        className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")}
                    />
                    <h3 className="truncate text-[14px] font-semibold tracking-tight text-foreground/85">{group.label}</h3>
                    <span className="shrink-0 text-[11px] text-muted-foreground/70">{group.fields.length} 项</span>
                </button>
                {dirtyCount > 0 && (
                    <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                        {dirtyCount} 项未保存
                    </span>
                )}
            </header>
            {open && (
                <div className="grid grid-cols-1 gap-x-5 gap-y-5 md:grid-cols-2">
                    {group.fields.map((field) => (
                        <div
                            key={field.key}
                            className={cn(
                                field.wide ||
                                    field.type === "list" ||
                                    field.type === "stringlist" ||
                                    field.type === "tokens" ||
                                    field.type === "json"
                                    ? "lg:col-span-2"
                                    : ""
                            )}
                        >
                            <FieldControl
                                field={field}
                                value={draft[field.key]}
                                dirty={isFieldDirty(field, draft, baseline)}
                                skinId={String(draft[APPEARANCE_SKIN_KEY] ?? "")}
                                onChange={(value) => onChange(field.key, value)}
                            />
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}

/** 单个字段的控件 */
function FieldControl({
    field,
    value,
    dirty,
    skinId,
    onChange,
}: {
    field: SettingsField;
    value: SettingsFormValue;
    dirty: boolean;
    /** 草稿里当前选中的皮肤 id：配色令牌编辑器用它算「留空 = 跟随皮肤」的回退色 */
    skinId?: string;
    onChange: (value: SettingsFormValue) => void;
}) {
    const label = (
        // 标签与 hint 都压成单行：没有 hint 的字段不会留空行，同一行里的输入框也能对齐
        // （hint 太长时截断成省略号，鼠标悬停看全文）
        <span className="mb-1.5 flex items-center gap-x-1.5 text-xs font-medium text-muted-foreground">
            <span className="shrink-0 whitespace-nowrap">{field.label}</span>
            {Array.isArray(value) && value.length > 0 && (
                <span className="shrink-0 font-normal text-muted-foreground/60">（{value.length} 条）</span>
            )}
            {dirty && <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-label="已改动" />}
            {field.hint && (
                <span className="min-w-0 flex-1 truncate font-normal text-muted-foreground/70" title={field.hint}>
                    · {field.hint}
                </span>
            )}
        </span>
    );

    if (field.type === "boolean") {
        return (
            <label className="flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                <Checkbox
                    checked={value === true}
                    onCheckedChange={(checked) => onChange(checked === true)}
                    aria-label={field.label}
                />
                <span className="shrink-0 whitespace-nowrap">{field.label}</span>
                {field.hint && (
                    <span className="ml-auto min-w-0 truncate text-right text-xs text-muted-foreground" title={field.hint}>
                        {field.hint}
                    </span>
                )}
            </label>
        );
    }

    if (field.type === "skin") {
        return (
            <div>
                {label}
                <SkinPicker value={String(value ?? "")} onChange={onChange} />
            </div>
        );
    }

    if (field.type === "tokens") {
        // 值可能是 string[]（同一个联合类型里的其它分支），先收窄成令牌分支再交给编辑器
        const branches: AppearanceTokenBranches =
            value && typeof value === "object" && !Array.isArray(value) ? (value as AppearanceTokenBranches) : {};
        return (
            <div>
                {label}
                <TokenColorEditor value={branches} onChange={onChange} skinId={skinId} />
            </div>
        );
    }

    if (field.type === "list") {
        return (
            <div>
                {label}
                <ListEditor
                    itemFields={field.itemFields ?? []}
                    value={Array.isArray(value) ? (value as Record<string, unknown>[]) : []}
                    onChange={(next) => onChange(next)}
                />
            </div>
        );
    }

    if (field.type === "stringlist") {
        return (
            <div>
                {label}
                <StringListEditor
                    value={Array.isArray(value) ? (value as string[]) : []}
                    onChange={(next) => onChange(next)}
                    placeholder={field.placeholder}
                />
            </div>
        );
    }

    if (field.type === "color") {
        const current = String(value ?? "");
        return (
            <label className="block">
                {label}
                <div className="flex items-center gap-2">
                    <input
                        type="color"
                        aria-label={field.label}
                        value={/^#[0-9a-f]{6}$/i.test(current.trim()) ? current.trim() : "#000000"}
                        onChange={(e) => onChange(e.target.value)}
                        className="size-9 shrink-0 cursor-pointer rounded-lg border bg-transparent"
                    />
                    <Input
                        value={current}
                        onChange={(e) => onChange(e.target.value)}
                        placeholder={field.placeholder ?? "#39c5bb"}
                        className="h-9 flex-1 text-sm"
                    />
                </div>
            </label>
        );
    }

    if (field.type === "json") {
        const text = String(value ?? "");
        let invalid = false;
        if (text.trim()) {
            try {
                JSON.parse(text);
            } catch {
                invalid = true;
            }
        }
        return (
            <label className="block">
                {label}
                <textarea
                    value={text}
                    onChange={(e) => onChange(e.target.value)}
                    rows={6}
                    spellCheck={false}
                    placeholder={field.placeholder ?? "[]"}
                    className={cn(
                        "w-full rounded-lg border border-input bg-transparent px-3 py-2 font-mono text-xs leading-relaxed outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                        invalid && "border-destructive"
                    )}
                />
                {invalid && (
                    <span className="mt-1 block text-[11px] text-destructive">
                        JSON 格式有误，请修正后再保存（否则后端拿到的是坏数据）
                    </span>
                )}
            </label>
        );
    }

    if (field.type === "select") {
        return (
            <label className="block">
                {label}
                <Select value={String(value ?? "")} onValueChange={(v) => onChange(v)}>
                    <SelectTrigger className="h-9 w-full rounded-lg text-sm" aria-label={field.label}>
                        <SelectValue placeholder={field.placeholder ?? "请选择"} />
                    </SelectTrigger>
                    <SelectContent>
                        {(field.options ?? []).map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                                {option.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </label>
        );
    }

    if (field.type === "textarea") {
        return (
            <label className="block">
                {label}
                <textarea
                    value={String(value ?? "")}
                    onChange={(e) => onChange(e.target.value)}
                    rows={3}
                    placeholder={field.placeholder}
                    className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                />
            </label>
        );
    }

    if (field.type === "image") {
        const raw = String(value ?? "").trim();
        // 站点配置里存的是站内相对路径（如 /api/f/…）：预览要按前台同一套规则解析，
        // 否则本地会把 /api/f/… 当成本站路由拿到一页 HTML，图片显示不出来
        const preview = resolveAssetUrl(raw);
        return (
            <label className="block">
                {label}
                <div className="flex items-center gap-2">
                    <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/40">
                        {preview ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={preview} alt="" className="size-full object-contain" />
                        ) : (
                            <ImageIcon className="size-4 text-muted-foreground/60" />
                        )}
                    </span>
                    <Input
                        value={String(value ?? "")}
                        onChange={(e) => onChange(e.target.value)}
                        placeholder={field.placeholder ?? "图片地址 / 上传后的直链"}
                        className="h-9 text-xs"
                    />
                    <ImageUploadButton
                        fieldLabel={field.label}
                        toFileManager={field.key === "USER_AVATAR"}
                        onUploaded={(url) => onChange(url)}
                    />
                </div>
            </label>
        );
    }

    return (
        <label className="block">
            {label}
            <Input
                type={field.type === "number" ? "number" : "text"}
                value={String(value ?? "")}
                onChange={(e) => onChange(e.target.value)}
                placeholder={field.placeholder}
                className="h-9 text-sm"
            />
        </label>
    );
}

/**
 * 图片字段右侧的「上传」按钮：选文件 → 经同源代理上传到后端 → 把返回地址回填进字段。
 * 后端返回的可能是本站绝对地址，这里统一转成同源相对路径（与既有配置口径一致）。
 */
function ImageUploadButton({
    fieldLabel,
    toFileManager = false,
    onUploaded,
}: {
    fieldLabel: string;
    /** true = 传进「文件管理」根目录（与 avatar.avif 同级）；默认走文章图片上传接口 */
    toFileManager?: boolean;
    onUploaded: (url: string) => void;
}) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);

    const handleFile = async (file: File) => {
        if (!file.type.startsWith("image/")) {
            toast.warning("请选择图片文件");
            return;
        }
        setUploading(true);
        try {
            // 站长头像要求落在文件管理根目录（和已有的 avatar.avif 同级），方便在文件管理里直接看到
            const raw = toFileManager ? await uploadFileToFileManager(file) : (await uploadAdminImageApi(file))?.url;
            const url = toSameOriginMediaUrl(raw ?? "");
            if (!url) {
                toast.error("上传成功但后端没有返回图片地址");
                return;
            }
            onUploaded(url);
            toast.success("图片已上传", {
                description: toFileManager ? "已存入文件管理根目录，别忘了点右下角「保存设置」" : "别忘了点右下角「保存设置」",
            });
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "图片上传失败");
        } finally {
            setUploading(false);
        }
    };

    return (
        <>
            <Button
                type="button"
                variant="outline"
                size="icon-lg"
                aria-label={`上传${fieldLabel}`}
                title="上传图片"
                className="shrink-0 rounded-lg"
                disabled={uploading}
                onClick={() => inputRef.current?.click()}
            >
                {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            </Button>
            <input
                ref={inputRef}
                type="file"
                accept="image/*"
                aria-label={`选择${fieldLabel}图片文件`}
                className="hidden"
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) void handleFile(file);
                }}
            />
        </>
    );
}

/** 皮肤选择：8 张色卡 */function SkinPicker({ value, onChange }: { value: string; onChange: (value: SettingsFormValue) => void }) {
    return (
        <div className="flex flex-wrap gap-2">
            {SKIN_OPTIONS.map((skin) => {
                const active = value === skin.value;
                return (
                    <button
                        key={skin.value}
                        type="button"
                        onClick={() => onChange(skin.value)}
                        aria-pressed={active}
                        className={cn(
                            "flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition-colors",
                            active ? "border-primary bg-primary/10 font-medium text-primary" : "hover:bg-muted"
                        )}
                    >
                        <span className="flex items-center gap-0.5">
                            <span className="size-3.5 rounded-full border" style={{ background: skinPreviewColor(skin.value, "light") }} />
                            <span className="size-3.5 rounded-full border" style={{ background: skinPreviewColor(skin.value, "dark") }} />
                        </span>
                        {skin.label}
                    </button>
                );
            })}
        </div>
    );
}

/** 列表编辑（支持一层嵌套，如页脚项目分组里的链接列表） */
function ListEditor({
    itemFields,
    value,
    onChange,
    nested = false,
    addLabel = "添加一项",
}: {
    itemFields: SettingsListField[];
    value: Record<string, unknown>[];
    onChange: (value: Record<string, unknown>[]) => void;
    nested?: boolean;
    addLabel?: string;
}) {
    const update = (index: number, name: string, next: unknown) => {
        onChange(value.map((item, i) => (i === index ? { ...item, [name]: next } : item)));
    };
    const move = (index: number, delta: number) => {
        const next = [...value];
        const target = index + delta;
        if (target < 0 || target >= next.length) return;
        [next[index], next[target]] = [next[target], next[index]];
        onChange(next);
    };

    // 一层列表里既有普通字段，也可能嵌一层列表（如「项目分组」里的链接）
    const flatFields = itemFields.filter((sub) => !sub.nested);
    const nestedFields = itemFields.filter((sub) => sub.nested);
    const columns = flatFields.length >= 3 ? "sm:grid-cols-3" : "sm:grid-cols-2";

    return (
        <div className={cn("rounded-lg border", nested && "border-dashed bg-muted/10")}>
            {value.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">还没有条目</p>
            ) : (
                <div className="divide-y">
                    {value.map((item, index) => (
                        <div key={index} className="flex flex-col gap-2 p-2 transition-colors hover:bg-muted/20 sm:flex-row sm:items-start">
                            <span className="mt-2 hidden w-4 shrink-0 text-[11px] tabular-nums text-muted-foreground/50 sm:block">
                                {index + 1}
                            </span>
                            <div className="min-w-0 flex-1 space-y-2">
                                <div className={cn("grid grid-cols-1 gap-2", columns)}>
                                    {flatFields.map((sub) => (
                                        <ListSubField
                                            key={sub.name}
                                            sub={sub}
                                            value={item[sub.name]}
                                            index={index}
                                            onChange={(next) => update(index, sub.name, next)}
                                        />
                                    ))}
                                </div>
                                {nestedFields.map((sub) => (
                                    <div key={sub.name}>
                                        <div className="mb-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                            <span>{sub.label}</span>
                                            <span className="text-muted-foreground/50">
                                                {Array.isArray(item[sub.name]) ? (item[sub.name] as unknown[]).length : 0} 条
                                            </span>
                                        </div>
                                        <ListEditor
                                            itemFields={sub.nested ?? []}
                                            value={Array.isArray(item[sub.name]) ? (item[sub.name] as Record<string, unknown>[]) : []}
                                            onChange={(next) => update(index, sub.name, next)}
                                            nested
                                            addLabel="添加链接"
                                        />
                                    </div>
                                ))}
                            </div>
                            <span className="flex shrink-0 items-center justify-end gap-0.5 sm:pt-0.5">
                                <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label="上移"
                                    title="上移"
                                    disabled={index === 0}
                                    onClick={() => move(index, -1)}
                                >
                                    <ArrowUp className="size-3.5" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label="下移"
                                    title="下移"
                                    disabled={index === value.length - 1}
                                    onClick={() => move(index, 1)}
                                >
                                    <ArrowDown className="size-3.5" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label="删除这一项"
                                    title="删除这一项"
                                    className="text-destructive hover:text-destructive"
                                    onClick={() => onChange(value.filter((_, i) => i !== index))}
                                >
                                    <Trash2 className="size-3.5" />
                                </Button>
                            </span>
                        </div>
                    ))}
                </div>
            )}
            <button
                type="button"
                onClick={() => {
                    const blank: Record<string, unknown> = {};
                    for (const sub of itemFields) blank[sub.name] = sub.nested ? [] : sub.type === "boolean" ? false : "";
                    onChange([...value, blank]);
                }}
                className="flex w-full items-center justify-center gap-1 rounded-b-lg border-t border-dashed px-3 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
                <Plus className="size-3" />
                {addLabel}
            </button>
        </div>
    );
}

/** 列表项里的一个子字段：按 sub.type 渲染成文本 / 数字 / 颜色 / 开关 */
function ListSubField({
    sub,
    value,
    index,
    onChange,
}: {
    sub: SettingsListField;
    value: unknown;
    index: number;
    onChange: (next: unknown) => void;
}) {
    const aria = `${sub.label}（第 ${index + 1} 项）`;

    if (sub.type === "boolean") {
        return (
            <label className="flex h-8 items-center gap-2 rounded-lg border px-2.5 text-xs">
                <Checkbox checked={value === true} onCheckedChange={(checked) => onChange(checked === true)} aria-label={aria} />
                <span className="truncate text-muted-foreground">{sub.label}</span>
            </label>
        );
    }

    if (sub.type === "color") {
        const current = String(value ?? "");
        return (
            <span className="flex items-center gap-2">
                <input
                    type="color"
                    aria-label={aria}
                    value={/^#[0-9a-f]{6}$/i.test(current.trim()) ? current.trim() : "#000000"}
                    onChange={(e) => onChange(e.target.value)}
                    className="size-8 shrink-0 cursor-pointer rounded border bg-transparent"
                />
                <Input
                    value={current}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={sub.placeholder ?? sub.label}
                    aria-label={aria}
                    className="h-8 flex-1 text-xs"
                />
            </span>
        );
    }

    return (
        <Input
            type={sub.type === "number" ? "number" : "text"}
            value={String(value ?? "")}
            onChange={(e) => onChange(e.target.value)}
            placeholder={sub.placeholder ?? sub.label}
            aria-label={aria}
            className="h-8 text-xs"
        />
    );
}

/** 字符串数组编辑（友链申请条件、作者技能、关于页技能等）：一行一条，可增删 / 上下移 */
function StringListEditor({
    value,
    onChange,
    placeholder,
}: {
    value: string[];
    onChange: (value: string[]) => void;
    placeholder?: string;
}) {
    const update = (index: number, next: string) => onChange(value.map((item, i) => (i === index ? next : item)));
    const move = (index: number, delta: number) => {
        const next = [...value];
        const target = index + delta;
        if (target < 0 || target >= next.length) return;
        [next[index], next[target]] = [next[target], next[index]];
        onChange(next);
    };

    return (
        <div className="rounded-lg border">
            {value.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">还没有条目</p>
            ) : (
                <div className="divide-y">
                    {value.map((item, index) => (
                        <div key={index} className="flex items-center gap-2 p-2">
                            <span className="hidden w-4 shrink-0 text-[11px] tabular-nums text-muted-foreground/50 sm:block">{index + 1}</span>
                            <Input
                                value={item}
                                onChange={(e) => update(index, e.target.value)}
                                placeholder={placeholder ?? "一条内容"}
                                aria-label={`第 ${index + 1} 条`}
                                className="h-8 flex-1 text-xs"
                            />
                            <Button variant="ghost" size="icon-sm" aria-label="上移" title="上移" disabled={index === 0} onClick={() => move(index, -1)}>
                                <ArrowUp className="size-3.5" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label="下移"
                                title="下移"
                                disabled={index === value.length - 1}
                                onClick={() => move(index, 1)}
                            >
                                <ArrowDown className="size-3.5" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label="删除这一条"
                                title="删除这一条"
                                className="text-destructive hover:text-destructive"
                                onClick={() => onChange(value.filter((_, i) => i !== index))}
                            >
                                <Trash2 className="size-3.5" />
                            </Button>
                        </div>
                    ))}
                </div>
            )}
            <button
                type="button"
                onClick={() => onChange([...value, ""])}
                className="flex w-full items-center justify-center gap-1 rounded-b-lg border-t border-dashed px-3 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
                <Plus className="size-3" />
                添加一条
            </button>
        </div>
    );
}
