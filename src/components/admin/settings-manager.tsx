"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Eraser, ImageIcon, Loader2, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    ALL_SETTINGS_FIELDS,
    APPEARANCE_TOKEN_FIELDS,
    SETTINGS_SECTIONS,
    SKIN_OPTIONS,
    buildSettingsBaseline,
    buildSettingsPayload,
    isFieldDirty,
    skinPreviewColor,
    type SettingsField,
    type SettingsFormValue,
    type SettingsGroup,
    type SettingsListField,
} from "@/lib/admin-settings";
import { updateAdminSettingsApi } from "@/lib/api";
import type { SiteConfig } from "@/types/site-config";
import { cn } from "@/lib/utils";

type Draft = Record<string, SettingsFormValue>;

/**
 * 后台系统设置：站点信息 / Logo 与图标 / 外观 / 页脚。
 *
 * 首屏值来自服务端取的 /public/site-config；保存时只提交改动项
 * （POST /api/admin/settings/update → 远端 /settings/update），保存后 router.refresh() 让
 * 服务端重新取配置，页面与前台立刻用上新值。
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

    const setValue = (key: string, value: SettingsFormValue) => setDraft((prev) => ({ ...prev, [key]: value }));

    const handleSave = async () => {
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
            toast.success(`已保存 ${Object.keys(payload).length} 项设置`);
            setBaseline(draft);
            router.refresh();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "保存失败");
        } finally {
            setSaving(false);
        }
    };

    const handleReset = () => {
        setDraft(baseline);
        toast.info("已还原为当前生效的设置");
    };

    return (
        <div className="space-y-3">
            {/* ===== 顶部操作条 ===== */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card px-4 py-2.5 shadow-sm">
                <div className="text-xs text-muted-foreground">
                    {dirtyFields.length === 0 ? (
                        <span>当前没有未保存的更改</span>
                    ) : (
                        <span>
                            有 <span className="font-medium text-foreground">{dirtyFields.length}</span> 项改动未保存：
                            <span className="ml-1 text-foreground/70">
                                {dirtyFields
                                    .slice(0, 3)
                                    .map((f) => f.label)
                                    .join("、")}
                                {dirtyFields.length > 3 ? " 等" : ""}
                            </span>
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-lg text-xs"
                        disabled={dirtyFields.length === 0 || saving}
                        onClick={handleReset}
                    >
                        <RotateCcw className="size-3.5" />
                        还原
                    </Button>
                    <Button size="sm" className="h-8 rounded-lg text-xs" disabled={saving} onClick={() => void handleSave()}>
                        {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                        保存{dirtyFields.length > 0 ? `（${dirtyFields.length}）` : ""}
                    </Button>
                </div>
            </div>

            {/* ===== 分区 ===== */}
            <Tabs value={tab} onValueChange={setTab} className="gap-3">
                <TabsList className="h-auto w-full flex-wrap justify-start gap-1 p-1">
                    {SETTINGS_SECTIONS.map((section) => (
                        <TabsTrigger key={section.id} value={section.id} className="h-7 flex-none px-3 text-xs">
                            {section.label}
                            {section.groups.flatMap((g) => g.fields).some((f) => dirtyKeys.has(f.key)) && (
                                <span className="ml-1 size-1.5 rounded-full bg-primary" aria-label="有改动" />
                            )}
                        </TabsTrigger>
                    ))}
                </TabsList>

                {SETTINGS_SECTIONS.map((section) => (
                    <TabsContent key={section.id} value={section.id} className="space-y-3">
                        {section.desc && <p className="text-xs text-muted-foreground">{section.desc}</p>}
                        {section.groups.map((group) => (
                            <SettingsGroupCard
                                key={group.id}
                                group={group}
                                draft={draft}
                                baseline={baseline}
                                onChange={setValue}
                            />
                        ))}
                    </TabsContent>
                ))}
            </Tabs>
        </div>
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
    return (
        <section className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="mb-3">
                <h3 className="text-sm font-semibold">{group.label}</h3>
                {group.note && <p className="mt-1 text-xs text-muted-foreground">ⓘ {group.note}</p>}
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {group.fields.map((field) => (
                    <div key={field.key} className={cn(field.wide || field.type === "list" || field.type === "tokens" ? "lg:col-span-2" : "")}>
                        <FieldControl
                            field={field}
                            value={draft[field.key]}
                            dirty={isFieldDirty(field, draft, baseline)}
                            onChange={(value) => onChange(field.key, value)}
                        />
                    </div>
                ))}
            </div>
        </section>
    );
}

/** 单个字段的控件 */
function FieldControl({
    field,
    value,
    dirty,
    onChange,
}: {
    field: SettingsField;
    value: SettingsFormValue;
    dirty: boolean;
    onChange: (value: SettingsFormValue) => void;
}) {
    const label = (
        <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            {field.label}
            {dirty && <span className="size-1.5 rounded-full bg-primary" aria-label="已改动" />}
            {field.hint && <span className="font-normal text-muted-foreground/70">· {field.hint}</span>}
        </span>
    );

    if (field.type === "boolean") {
        return (
            <label className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                <Checkbox
                    checked={value === true}
                    onCheckedChange={(checked) => onChange(checked === true)}
                    aria-label={field.label}
                />
                <span>{field.label}</span>
                {field.hint && <span className="ml-auto text-xs text-muted-foreground">{field.hint}</span>}
            </label>
        );
    }

    if (field.key === "APPEARANCE_SKIN") {
        return (
            <div>
                {label}
                <SkinPicker value={String(value ?? "")} onChange={onChange} />
            </div>
        );
    }

    if (field.type === "tokens") {
        return (
            <div>
                {label}
                <TokensEditor
                    value={(value && typeof value === "object" && !Array.isArray(value) ? value : {}) as { light?: Record<string, string>; dark?: Record<string, string> }}
                    onChange={onChange}
                />
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
        const url = String(value ?? "").trim();
        return (
            <label className="block">
                {label}
                <div className="flex items-center gap-2">
                    <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/40">
                        {url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={url} alt="" className="size-full object-contain" />
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

/** 皮肤选择：8 张色卡 */
function SkinPicker({ value, onChange }: { value: string; onChange: (value: SettingsFormValue) => void }) {
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

/** 配色令牌编辑：浅色 / 深色两列，留空表示用皮肤默认 */
function TokensEditor({
    value,
    onChange,
}: {
    value: { light?: Record<string, string>; dark?: Record<string, string> };
    onChange: (value: SettingsFormValue) => void;
}) {
    const setToken = (mode: "light" | "dark", name: string, next: string) => {
        const branch = { ...(value?.[mode] ?? {}) };
        if (next.trim() === "") delete branch[name];
        else branch[name] = next.trim();
        const out: { light?: Record<string, string>; dark?: Record<string, string> } = { ...value };
        if (Object.keys(branch).length === 0) delete out[mode];
        else out[mode] = branch;
        onChange(out);
    };

    return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(["light", "dark"] as const).map((mode) => (
                <div key={mode} className="rounded-lg border p-3">
                    <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs font-medium">{mode === "light" ? "浅色模式" : "深色模式"}</span>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 rounded-md px-1.5 text-[11px]"
                            disabled={!value?.[mode] || Object.keys(value[mode] ?? {}).length === 0}
                            onClick={() => {
                                const out = { ...value };
                                delete out[mode];
                                onChange(Object.keys(out).length ? out : {});
                            }}
                        >
                            <Eraser className="size-3" />
                            全部清除
                        </Button>
                    </div>
                    <div className="space-y-1.5">
                        {APPEARANCE_TOKEN_FIELDS.map((token) => {
                            const current = value?.[mode]?.[token.name] ?? "";
                            return (
                                <div key={token.name} className="flex items-center gap-2">
                                    <span className="w-20 shrink-0 text-xs text-muted-foreground">{token.label}</span>
                                    <input
                                        type="color"
                                        aria-label={`${token.label}（${mode === "light" ? "浅色" : "深色"}）`}
                                        value={/^#[0-9a-f]{6}$/i.test(current) ? current : "#000000"}
                                        onChange={(e) => setToken(mode, token.name, e.target.value)}
                                        className="size-7 shrink-0 cursor-pointer rounded border bg-transparent"
                                    />
                                    <Input
                                        value={current}
                                        onChange={(e) => setToken(mode, token.name, e.target.value)}
                                        placeholder="留空 = 皮肤默认"
                                        className="h-7 flex-1 text-xs"
                                    />
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
}

/** 列表编辑（支持一层嵌套，如页脚项目分组里的链接列表） */function ListEditor({
    itemFields,
    value,
    onChange,
}: {
    itemFields: SettingsListField[];
    value: Record<string, unknown>[];
    onChange: (value: Record<string, unknown>[]) => void;
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

    return (
        <div className="space-y-2">
            {value.length === 0 && <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">还没有条目</p>}
            {value.map((item, index) => (
                <div key={index} className="rounded-lg border bg-muted/20 p-2.5">
                    <div className="mb-2 flex items-center justify-between">
                        <span className="text-[11px] text-muted-foreground">#{index + 1}</span>
                        <span className="flex items-center gap-0.5">
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
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {itemFields.map((sub) =>
                            sub.nested ? (
                                <div key={sub.name} className="sm:col-span-2">
                                    <span className="mb-1 block text-[11px] text-muted-foreground">{sub.label}</span>
                                    <ListEditor
                                        itemFields={sub.nested}
                                        value={Array.isArray(item[sub.name]) ? (item[sub.name] as Record<string, unknown>[]) : []}
                                        onChange={(next) => update(index, sub.name, next)}
                                    />
                                </div>
                            ) : (
                                <label key={sub.name} className="block">
                                    <span className="mb-1 block text-[11px] text-muted-foreground">{sub.label}</span>
                                    <Input
                                        value={String(item[sub.name] ?? "")}
                                        onChange={(e) => update(index, sub.name, e.target.value)}
                                        placeholder={sub.placeholder}
                                        className="h-8 text-xs"
                                    />
                                </label>
                            )
                        )}
                    </div>
                </div>
            ))}
            <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-lg text-xs"
                onClick={() => {
                    const blank: Record<string, unknown> = {};
                    for (const sub of itemFields) blank[sub.name] = sub.nested ? [] : "";
                    onChange([...value, blank]);
                }}
            >
                <Plus className="size-3.5" />
                添加一项
            </Button>
        </div>
    );
}
