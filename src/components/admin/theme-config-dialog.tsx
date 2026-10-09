"use client";

// 主题配置弹窗：按后端返回的配置定义动态渲染表单，保存到 POST /api/theme/config。
//
// 数据来源（两个只读请求并发，与官方前端一致，见只读对照
// src/components/admin/themes/ThemeConfigDialog.tsx:38-83）：
//  - GET /api/admin/themes/settings?theme_name=…  → 字段定义 []ThemeSettingGroup
//  - GET /api/admin/themes/config?theme_name=…    → 用户已保存的裸配置（不含默认值）
//  二者合并成初始值：{ ...字段默认值, ...用户配置 }（后端 current-config 也是这个口径，
//  service.go:2285-2292）。
//
// 字段类型（后端 service.go:165）：text | textarea | number | select | color | switch | image | code
// 显示条件（service.go:192-196）：condition { field, operator: eq|neq|contains|gt|lt, value }，
// 判断逻辑对齐只读对照 use-theme-page 同目录的 shouldShowField。
//
// 保存注意：后端 SaveUserThemeConfig 是**整体覆盖**保存（service.go:2237-2244），
// 并按定义校验 required（service.go:2296-2337），所以提交前先做一次必填校验，
// 避免「必填字段没填 → 400」的无效往返。

import { useCallback, useEffect, useMemo, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Settings2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { getUserThemeConfigApi, getThemeSettingsApi, saveUserThemeConfigApi } from "@/lib/api-themes-write";
import type { ThemeConfigValues, ThemeSettingField, ThemeSettingGroup } from "@/types/themes";

interface ThemeConfigDialogProps {
    /** 要配置的主题名；null 表示关闭 */
    themeName: string | null;
    onClose: () => void;
    /** 保存成功后回调（调用方用来提示 / 刷新列表） */
    onSaved?: (themeName: string) => void;
}

/** 后端 map[string]interface{} 的实际值：可能不是标量，取字符串时统一兜底 */
function displayValue(value: unknown): string {
    if (value === null || value === undefined) return "";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
}

/**
 * 字段是否显示：condition 为空恒显示；否则按 operator 比较依赖字段的当前值。
 * 对齐只读对照 use-theme-page.ts / ThemeConfigDialog.tsx:91-112 的 shouldShowField。
 */
function shouldShowField(field: ThemeSettingField, values: Record<string, unknown>): boolean {
    const condition = field.condition;
    if (!condition?.field) return true;
    const current = values[condition.field];
    switch (condition.operator) {
        case "eq":
            return current === condition.value;
        case "neq":
            return current !== condition.value;
        case "contains":
            return displayValue(current).includes(displayValue(condition.value));
        case "gt":
            return Number(current) > Number(condition.value);
        case "lt":
            return Number(current) < Number(condition.value);
        default:
            return true;
    }
}

/** 单个字段的渲染（受控：值来自 values，改动回写 setValue） */
function FieldControl({
    field,
    value,
    onChange,
}: {
    field: ThemeSettingField;
    value: unknown;
    onChange: (next: string | number | boolean) => void;
}) {
    const text = displayValue(value);
    const type = field.type ?? "text";

    if (type === "switch") {
        return (
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2">
                <span className="min-w-0">
                    <span className="text-sm font-medium">
                        {field.label}
                        {field.required && <span className="ml-1 text-destructive">*</span>}
                    </span>
                    {field.description && (
                        <span className="mt-0.5 block text-xs text-muted-foreground">{field.description}</span>
                    )}
                </span>
                <Checkbox checked={value === true} onCheckedChange={(checked) => onChange(checked === true)} />
            </label>
        );
    }

    if (type === "select" && field.options && field.options.length > 0) {
        return (
            <div className="space-y-1.5">
                <Label className="text-xs">
                    {field.label}
                    {field.required && <span className="ml-1 text-destructive">*</span>}
                </Label>
                <Select value={text} onValueChange={(next) => onChange(next)}>
                    <SelectTrigger size="sm" className="h-8 w-full text-xs">
                        <SelectValue placeholder={field.placeholder || `请选择${field.label}`} />
                    </SelectTrigger>
                    <SelectContent>
                        {field.options.map((option, index) => (
                            <SelectItem key={`${displayValue(option.value)}-${index}`} value={displayValue(option.value)}>
                                {option.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                {field.description && <p className="text-xs text-muted-foreground">{field.description}</p>}
            </div>
        );
    }

    if (type === "color") {
        return (
            <div className="space-y-1.5">
                <Label className="text-xs">
                    {field.label}
                    {field.required && <span className="ml-1 text-destructive">*</span>}
                </Label>
                <div className="flex items-center gap-2">
                    {/* 原生取色器（不引第三方依赖）：仅作为文本值的可视化补充 */}
                    <input
                        type="color"
                        aria-label={`${field.label} 取色`}
                        value={/^#[0-9a-fA-F]{6}$/.test(text) ? text : "#000000"}
                        onChange={(e) => onChange(e.target.value)}
                        className="size-8 shrink-0 cursor-pointer rounded-md border bg-transparent"
                    />
                    <Input
                        value={text}
                        placeholder={field.placeholder || "#000000"}
                        onChange={(e) => onChange(e.target.value)}
                        className="h-8 font-mono text-xs"
                    />
                </div>
                {field.description && <p className="text-xs text-muted-foreground">{field.description}</p>}
            </div>
        );
    }

    if (type === "textarea" || type === "code") {
        return (
            <div className="space-y-1.5">
                <Label className="text-xs">
                    {field.label}
                    {field.required && <span className="ml-1 text-destructive">*</span>}
                </Label>
                <textarea
                    value={text}
                    placeholder={field.placeholder || (type === "code" ? "请输入代码" : `请输入${field.label}`)}
                    spellCheck={false}
                    onChange={(e) => onChange(e.target.value)}
                    className={cn(
                        "min-h-20 w-full resize-y rounded-lg border bg-transparent p-2.5 text-xs outline-none",
                        "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30",
                        type === "code" && "font-mono"
                    )}
                />
                {field.description && <p className="text-xs text-muted-foreground">{field.description}</p>}
            </div>
        );
    }

    // text / number / image / 未知类型都落到单行输入
    return (
        <div className="space-y-1.5">
            <Label className="text-xs">
                {field.label}
                {field.required && <span className="ml-1 text-destructive">*</span>}
            </Label>
            <Input
                type={type === "number" ? "number" : "text"}
                value={text}
                placeholder={field.placeholder || (type === "image" ? "输入图片地址" : `请输入${field.label}`)}
                onChange={(e) => onChange(e.target.value)}
                className={cn("h-8 text-xs", type === "image" && "font-mono")}
            />
            {field.description && <p className="text-xs text-muted-foreground">{field.description}</p>}
        </div>
    );
}

/**
 * 主题配置弹窗：拉取字段定义 + 用户配置 → 动态表单 → 整体保存。
 * 无配置项（例如官方内置主题，service.go:2177-2181 返回空数组）时给出明确空态。
 */
export function ThemeConfigDialog({ themeName, onClose, onSaved }: ThemeConfigDialogProps) {
    const open = themeName !== null;
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    /** 字段定义（分组） */
    const [groups, setGroups] = useState<ThemeSettingGroup[]>([]);
    /** 当前编辑值（默认值 + 用户配置） */
    const [values, setValues] = useState<Record<string, unknown>>({});
    /** 定义里的默认值，仅用于「恢复默认」 */
    const [defaults, setDefaults] = useState<Record<string, unknown>>({});
    /** 当前分组（分组 >1 时以 Tab 切换） */
    const [activeGroup, setActiveGroup] = useState("");
    const [loadError, setLoadError] = useState<string | null>(null);

    // 打开时加载：字段定义与已保存配置并发拉取
    useEffect(() => {
        if (!themeName) return;
        let cancelled = false;

        const load = async () => {
            setLoading(true);
            setLoadError(null);
            try {
                const [settings, userConfig] = await Promise.all([
                    getThemeSettingsApi(themeName),
                    getUserThemeConfigApi(themeName),
                ]);
                if (cancelled) return;

                const safeGroups = Array.isArray(settings) ? settings : [];
                setGroups(safeGroups);
                setActiveGroup(safeGroups[0]?.group ?? "");

                // 定义里的 default 作为兜底值（后端保存的是裸配置，不含默认值）
                const defaultValues: Record<string, unknown> = {};
                for (const group of safeGroups) {
                    for (const field of group.fields ?? []) {
                        if (field.default !== undefined && field.default !== null) defaultValues[field.name] = field.default;
                    }
                }
                setDefaults(defaultValues);
                setValues({ ...defaultValues, ...(userConfig ?? {}) });
            } catch (e) {
                if (cancelled) return;
                setGroups([]);
                setValues({});
                setLoadError(e instanceof Error ? e.message : "加载主题配置失败");
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        void load();
        return () => {
            cancelled = true;
        };
    }, [themeName]);

    /** 关闭并清空状态（下次打开重新拉取） */
    const handleClose = useCallback(() => {
        setGroups([]);
        setValues({});
        setDefaults({});
        setActiveGroup("");
        setLoadError(null);
        onClose();
    }, [onClose]);

    const updateValue = useCallback((name: string, next: string | number | boolean) => {
        setValues((prev) => ({ ...prev, [name]: next }));
    }, []);

    /** 当前分组（未选分组时兜底第一组） */
    const currentGroup = useMemo(
        () => groups.find((group) => group.group === activeGroup) ?? groups[0],
        [groups, activeGroup]
    );

    /** 可见字段（条件命中的） */
    const visibleFields = useMemo(
        () => (currentGroup?.fields ?? []).filter((field) => shouldShowField(field, values)),
        [currentGroup, values]
    );

    const canSave = groups.length > 0;

    const handleSave = async () => {
        if (!themeName) return;

        // 提交前先按定义做必填校验（后端也会校验，这里省一次无效往返）
        for (const group of groups) {
            for (const field of group.fields ?? []) {
                if (!field.required) continue;
                if (!shouldShowField(field, values)) continue;
                const value = values[field.name];
                if (value === undefined || value === null || value === "") {
                    toast.error(`「${field.label}」为必填项`);
                    return;
                }
            }
        }

        // 组装提交值：number 字段转数字（后端按 float64 校验 min/max），空串原样保留
        const payload: ThemeConfigValues = {};
        for (const [key, value] of Object.entries(values)) {
            if (typeof value === "string" && value.trim() === "") continue;
            const field = groups.flatMap((group) => group.fields ?? []).find((item) => item.name === key);
            if (field?.type === "number" && typeof value === "string") {
                const num = Number(value);
                if (Number.isFinite(num)) payload[key] = num;
                continue;
            }
            if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") payload[key] = value;
        }

        setSaving(true);
        try {
            await saveUserThemeConfigApi(themeName, payload);
            toast.success("主题配置已保存");
            onSaved?.(themeName);
            handleClose();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "保存主题配置失败");
        } finally {
            setSaving(false);
        }
    };

    return (
        <DialogPrimitive.Root
            open={open}
            onOpenChange={(next) => {
                if (!next) handleClose();
            }}
        >
            <DialogPrimitive.Portal>
                <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
                <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[86vh] w-[min(94vw,44rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border bg-card shadow-2xl data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
                    <div className="flex shrink-0 items-start gap-2 border-b px-5 py-3.5">
                        <Settings2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                            <DialogPrimitive.Title className="truncate text-base font-semibold">
                                {themeName ?? ""} · 主题设置
                            </DialogPrimitive.Title>
                            <DialogPrimitive.Description className="mt-0.5 text-xs text-muted-foreground">
                                字段由主题的 theme.json 定义；保存会整体覆盖该主题的用户配置。
                            </DialogPrimitive.Description>
                        </div>
                    </div>

                    <div className="admin-scroll min-h-0 flex-1">
                        {loading ? (
                            <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
                                正在加载配置…
                            </div>
                        ) : loadError ? (
                            <div className="flex flex-col items-center justify-center gap-1.5 py-16 text-sm">
                                <p className="text-destructive">{loadError}</p>
                                <p className="text-xs text-muted-foreground">
                                    请确认该主题已安装，且 theme.json 里带有 settings 段
                                </p>
                            </div>
                        ) : groups.length === 0 ? (
                            <div className="flex flex-col items-center justify-center gap-1.5 py-16 text-sm text-muted-foreground">
                                <Settings2 className="size-5 opacity-60" />
                                <span>该主题暂无可配置项</span>
                                <span className="text-xs text-muted-foreground/70">
                                    官方内置主题不提供自定义配置
                                </span>
                            </div>
                        ) : (
                            <div className="space-y-3 p-5">
                                {/* 分组切换：>1 组时才显示 */}
                                {groups.length > 1 && (
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        {groups.map((group) => (
                                            <button
                                                key={group.group}
                                                type="button"
                                                onClick={() => setActiveGroup(group.group)}
                                                className={cn(
                                                    "rounded-lg border px-2.5 py-1 text-xs transition-colors",
                                                    currentGroup?.group === group.group
                                                        ? "border-primary/40 bg-primary/10 text-primary"
                                                        : "text-muted-foreground hover:text-foreground"
                                                )}
                                            >
                                                {group.label || group.group}
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {visibleFields.length === 0 ? (
                                    <p className="py-6 text-center text-xs text-muted-foreground">
                                        该分组下没有当前可显示的字段
                                    </p>
                                ) : (
                                    visibleFields.map((field) => (
                                        <FieldControl
                                            key={field.name}
                                            field={field}
                                            value={values[field.name]}
                                            onChange={(next) => updateValue(field.name, next)}
                                        />
                                    ))
                                )}
                            </div>
                        )}
                    </div>

                    <div className="flex shrink-0 items-center justify-end gap-2 border-t bg-muted/40 px-5 py-3">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs"
                            disabled={saving || groups.length === 0}
                            onClick={() => setValues({ ...defaults })}
                        >
                            恢复默认
                        </Button>
                        <Button variant="outline" size="sm" className="h-8 text-xs" disabled={saving} onClick={handleClose}>
                            取消
                        </Button>
                        <Button
                            size="sm"
                            className="h-8 text-xs"
                            disabled={saving || !canSave}
                            onClick={() => void handleSave()}
                        >
                            {saving ? "保存中…" : "保存配置"}
                        </Button>
                    </div>
                </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
    );
}
