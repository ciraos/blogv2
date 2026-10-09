"use client";

import { Copy, RotateCcw, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    APPEARANCE_TOKEN_CSS_VARS,
    APPEARANCE_TOKEN_FIELDS,
    resolveTokenPreview,
    skinLabel,
    skinPresetTokens,
    type AppearanceTokenBranches,
    type SettingsFormValue,
} from "@/lib/admin-settings";
import type { AppearanceModeTokens } from "@/lib/appearance";
import { cn } from "@/lib/utils";

/**
 * 自定义配色令牌编辑器（后端键 APPEARANCE_TOKENS）。
 *
 * 为什么单独抽一个组件：色块取色、十六进制文本、逐项「跟随皮肤」、皮肤回退值、实时预览
 * 这几件事要互相联动，塞进 settings-manager 里会把那个文件拖得更乱。
 *
 * 交互取材（官方快照 scripts/theme/theme-anheyu-next-main，只读参考）：
 *  - 「色块上盖一个透明的原生 <input type="color">」的写法抄自官方
 *    src/components/admin/settings/editors/VisualArrayEditor.tsx:151-179 与
 *    editors/CreativityEditor.tsx:300-329（色块做视觉、原生取色器做交互，右侧配十六进制输入框）；
 *  - 官方 src/components/ui/form-color-picker.tsx 是「色板预设 + HSB 色域 + 色相滑杆 + 随机 + hex」
 *    的弹层取色器，依赖 react-aria-components / @heroui/react；本站没有这两个依赖（不许新增依赖），
 *    所以只用浏览器原生取色器 + 十六进制双向同步达到同等「能取色、能改文本」的效果；
 *  - 官方那套没有「留空 = 跟随皮肤」的概念（它的 APPEARANCE_TOKENS 编辑器不在给到的快照里），
 *    这一层是本项目自己的令牌覆盖语义：留空 = 用皮肤预设值，所以这里额外给了逐项/整模式恢复
 *    与「跟随皮肤色」的回退提示。
 *
 * 数据格式不变：内部状态就是 `{ light?: {...}, dark?: {...} }`，保存时仍由
 * buildSettingsPayload（src/lib/admin-settings.ts）序列化成 JSON 字符串提交，
 * 与后端默认值 "{}" 及 definition.go:53 的注释结构一致。
 */

/** 两个分支的展示口径：预览卡用固定的浅/深底色，不跟随后台当前明暗，否则切到深色后台就看不到浅色分支的真实效果 */
const MODES = [
    { id: "light", label: "浅色模式", short: "浅色", surface: "#ffffff", ink: "#111827" },
    { id: "dark", label: "深色模式", short: "深色", surface: "#0b0b0f", ink: "#f4f4f5" },
] as const;

type ModeId = (typeof MODES)[number]["id"];

const HEX6 = /^#[0-9a-f]{6}$/i;
const HEX3 = /^#[0-9a-f]{3}$/i;

/** #abc → #aabbcc */
function expandHex(value: string): string {
    const body = value.trim().replace(/^#/, "").toLowerCase();
    return `#${body
        .split("")
        .map((char) => char + char)
        .join("")}`;
}

/**
 * 原生取色器只认 #rrggbb：其它写法（#rgb / rgb() / #rrggbbaa）退回黑色，
 * 但令牌里仍然原样保存用户写的值（后端只是把它塞进 CSS 变量，别的写法也能生效）。
 */
function toColorInputValue(value: string): string {
    const trimmed = value.trim();
    if (HEX6.test(trimmed)) return trimmed;
    if (HEX3.test(trimmed)) return expandHex(trimmed);
    return "#000000";
}

/** 失焦时归一十六进制写法（#abc → #aabbcc、统一小写）；非十六进制保持原样不误伤 */
function normalizeHexInput(value: string): string {
    const trimmed = value.trim();
    if (HEX3.test(trimmed)) return expandHex(trimmed);
    if (HEX6.test(trimmed)) return trimmed.toLowerCase();
    return trimmed;
}

/** 语义色胶囊上的文字色：按相对亮度选黑/白，免得「警告黄」这类亮色上白字看不清 */
function readableInk(color: string): string {
    if (!HEX6.test(color.trim())) return "#ffffff";
    const body = color.trim().slice(1);
    const [r, g, b] = [0, 2, 4].map((index) => parseInt(body.slice(index, index + 2), 16) / 255);
    const linear = (channel: number) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
    const luminance = 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
    return luminance > 0.45 ? "#111111" : "#ffffff";
}

/** 某分支里真正写了值的令牌个数（空白算留空） */
function countOverrides(branch?: Record<string, string>): number {
    if (!branch) return 0;
    return APPEARANCE_TOKEN_FIELDS.filter((token) => (branch[token.name] ?? "").trim() !== "").length;
}

interface TokenColorEditorProps {
    value: AppearanceTokenBranches;
    onChange: (value: SettingsFormValue) => void;
    /** 草稿里当前选中的皮肤 id：决定「留空 = 跟随皮肤」的回退色（空/未知按默认皮肤算） */
    skinId?: string;
}

export function TokenColorEditor({ value, onChange, skinId }: TokenColorEditorProps) {
    const branches: AppearanceTokenBranches = value ?? {};
    const preset = skinPresetTokens(skinId);
    const preview = resolveTokenPreview(skinId, branches);
    const overrideTotal = MODES.reduce((sum, mode) => sum + countOverrides(branches[mode.id]), 0);
    const tokenTotal = APPEARANCE_TOKEN_FIELDS.length * MODES.length;

    /** 写单个令牌：空值 = 删键（留空 → 跟随皮肤），分支空了就连分支一起删，回到 {} */
    const setToken = (mode: ModeId, name: string, next: string) => {
        const branch = { ...(branches[mode] ?? {}) };
        const cleaned = next.trim();
        if (cleaned === "") delete branch[name];
        else branch[name] = cleaned;

        const out: AppearanceTokenBranches = { ...branches };
        if (Object.keys(branch).length === 0) delete out[mode];
        else out[mode] = branch;

        // 两个分支都空了就提交 {}：与后端默认值 "{}"（= 留空、全部跟随皮肤）完全一致
        onChange(Object.keys(out).length === 0 ? {} : out);
    };

    const clearMode = (mode: ModeId) => {
        const out: AppearanceTokenBranches = { ...branches };
        delete out[mode];
        onChange(Object.keys(out).length === 0 ? {} : out);
    };

    /**
     * 把某个模式里已自定义的令牌铺到另一个模式上。
     * 用合并而不是覆盖：目标模式独有的调整（比如深色单独压暗过的令牌）不会被抹掉。
     */
    const copyMode = (from: ModeId, to: ModeId) => {
        const source = branches[from] ?? {};
        const picked = APPEARANCE_TOKEN_FIELDS.filter((token) => (source[token.name] ?? "").trim() !== "");
        if (picked.length === 0) return;
        const copied: Record<string, string> = { ...(branches[to] ?? {}) };
        for (const token of picked) copied[token.name] = source[token.name].trim();
        // 不用 out[to] 动态键：显式写两个分支，类型最直观
        const out: AppearanceTokenBranches = { ...branches };
        if (to === "light") out.light = copied;
        else out.dark = copied;
        onChange(out);
    };

    return (
        <div className="space-y-3">
            {/* 顶部口径：留空到底等于什么颜色 */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                    <Sparkles className="size-3" />
                    留空 = 跟随皮肤「{skinLabel(skinId)}」
                </span>
                <span
                    className={cn(
                        "rounded px-1.5 py-px",
                        overrideTotal > 0 ? "bg-primary/10 font-medium text-primary" : "bg-muted"
                    )}
                >
                    {overrideTotal > 0 ? `已自定义 ${overrideTotal} / ${tokenTotal} 项` : "全部跟随皮肤"}
                </span>
                <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    className="h-6 rounded-md px-1.5 text-[11px]"
                    disabled={overrideTotal === 0}
                    onClick={() => onChange({})}
                    title="清空全部覆盖，浅色/深色都回到皮肤自带颜色"
                >
                    <RotateCcw className="size-3" />
                    全部恢复皮肤
                </Button>
            </div>

            {/* 浅色 / 深色两套值分列 */}
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {MODES.map((mode) => {
                    // 「复制到另一模式」用
                    const other = mode.id === "light" ? MODES[1] : MODES[0];
                    return (
                        <TokenModePanel
                            key={mode.id}
                            mode={mode}
                            branch={branches[mode.id] ?? {}}
                            skinTokens={preset[mode.id]}
                            otherLabel={other.short}
                            onSet={(name, next) => setToken(mode.id, name, next)}
                            onClear={() => clearMode(mode.id)}
                            onCopy={() => copyMode(mode.id, other.id)}
                        />
                    );
                })}
            </div>

            {/* 实时预览：改色立刻反映，取值 = 皮肤预设 + 覆盖（与前台 resolveAppearance 同口径） */}
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {MODES.map((mode) => (
                    <TokenPreviewCard
                        key={mode.id}
                        mode={mode}
                        tokens={preview[mode.id]}
                        overrideCount={countOverrides(branches[mode.id])}
                    />
                ))}
            </div>
        </div>
    );
}

/** 单个模式的取色面板：一行一个令牌 */
function TokenModePanel({
    mode,
    branch,
    skinTokens,
    otherLabel,
    onSet,
    onClear,
    onCopy,
}: {
    mode: (typeof MODES)[number];
    branch: Record<string, string>;
    skinTokens: AppearanceModeTokens;
    otherLabel: string;
    onSet: (name: string, next: string) => void;
    onClear: () => void;
    onCopy: () => void;
}) {
    const count = countOverrides(branch);

    return (
        <div className="rounded-lg border border-border/70">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border/50 px-3 py-2">
                <span className="text-xs font-medium text-foreground/85">{mode.label}</span>
                <span
                    className={cn(
                        "rounded px-1.5 py-px text-[10px]",
                        count > 0 ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                    )}
                >
                    {count > 0 ? `已覆盖 ${count} 项` : "跟随皮肤"}
                </span>
                <span className="ml-auto flex items-center gap-1">
                    <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        className="h-6 rounded-md px-1.5 text-[11px]"
                        disabled={count === 0}
                        onClick={onCopy}
                        title={`把${mode.short}已自定义的 ${count} 项写到${otherLabel}分支上（${otherLabel}自己独有的项保留）`}
                    >
                        <Copy className="size-3" />
                        复制到{otherLabel}
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        className="h-6 rounded-md px-1.5 text-[11px]"
                        disabled={count === 0}
                        onClick={onClear}
                        title={`${mode.short}全部恢复皮肤色`}
                    >
                        <RotateCcw className="size-3" />
                        恢复
                    </Button>
                </span>
            </div>

            <div className="divide-y divide-border/40">
                {APPEARANCE_TOKEN_FIELDS.map((token) => {
                    const raw = branch[token.name] ?? "";
                    const overridden = raw.trim() !== "";
                    const skinColor = skinTokens[token.name];
                    // 未覆盖时色块直接显示皮肤色 —— 「留空会是什么颜色」一眼可见
                    const shown = overridden ? raw.trim() : skinColor;

                    return (
                        <div key={token.name} className="flex items-center gap-2 px-3 py-2">
                            <span className="w-[76px] shrink-0">
                                <span className="block truncate text-xs text-foreground/80" title={token.desc}>
                                    {token.label}
                                </span>
                                <span
                                    className="block truncate font-mono text-[10px] text-muted-foreground/60"
                                    title={`CSS 变量 ${APPEARANCE_TOKEN_CSS_VARS[token.name]}`}
                                >
                                    {APPEARANCE_TOKEN_CSS_VARS[token.name]}
                                </span>
                            </span>

                            {/* 色块 + 盖在上面的透明原生取色器（官方同款，见文件头注释） */}
                            <div className="relative size-8 shrink-0" title={`${token.label}：点击取色`}>
                                <input
                                    type="color"
                                    value={toColorInputValue(shown)}
                                    onChange={(event) => onSet(token.name, event.target.value)}
                                    aria-label={`${token.label}（${mode.short}）取色`}
                                    className="peer absolute inset-0 size-full cursor-pointer opacity-0"
                                />
                                <span
                                    className="pointer-events-none absolute inset-0 rounded-md border border-black/15 transition-transform peer-hover:scale-105 dark:border-white/20"
                                    style={{ background: shown }}
                                />
                                {!overridden && (
                                    <span
                                        className="pointer-events-none absolute -right-0.5 -top-0.5 size-2 rounded-full border border-card bg-muted-foreground/40"
                                        title="跟随皮肤（未自定义）"
                                    />
                                )}
                            </div>

                            <Input
                                value={raw}
                                onChange={(event) => onSet(token.name, event.target.value)}
                                onBlur={(event) => {
                                    const next = normalizeHexInput(event.target.value);
                                    if (next !== event.target.value) onSet(token.name, next);
                                }}
                                placeholder={skinColor}
                                spellCheck={false}
                                aria-label={`${token.label}（${mode.short}）十六进制值`}
                                className="h-8 flex-1 font-mono text-xs"
                            />

                            <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                className="shrink-0 rounded-md"
                                disabled={!overridden}
                                onClick={() => onSet(token.name, "")}
                                title={overridden ? `恢复皮肤色 ${skinColor}` : "当前已跟随皮肤"}
                                aria-label={`${token.label}（${mode.short}）恢复皮肤色`}
                            >
                                <RotateCcw className="size-3.5" />
                            </Button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

/** 预览色卡：用固定浅/深底色渲染，避免后台自身明暗干扰判断 */
function TokenPreviewCard({
    mode,
    tokens,
    overrideCount,
}: {
    mode: (typeof MODES)[number];
    tokens: AppearanceModeTokens;
    overrideCount: number;
}) {
    // 强调色映射到 --ring：用一圈描边示意（非十六进制时不加外发光，免得拼出非法 CSS）
    const accentRing = HEX6.test(tokens.accent.trim()) ? `0 0 0 3px ${tokens.accent.trim()}33` : undefined;

    return (
        <div className="rounded-lg border border-border/70 p-3" style={{ background: mode.surface, color: mode.ink }}>
            <div className="mb-2 flex items-center justify-between text-[11px] opacity-60">
                <span>{mode.label}预览</span>
                <span>{overrideCount > 0 ? `自定义 ${overrideCount} 项` : "全部跟随皮肤"}</span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <span
                    className="rounded-md px-2.5 py-1 text-xs font-medium"
                    style={{ background: tokens.primary, color: tokens.primaryForeground }}
                >
                    主色按钮
                </span>
                <span className="rounded-md border-2 px-2.5 py-1 text-xs" style={{ borderColor: tokens.accent, boxShadow: accentRing }}>
                    聚焦环
                </span>
                {(["success", "warning", "danger", "info"] as const).map((key) => {
                    const label = APPEARANCE_TOKEN_FIELDS.find((token) => token.name === key)?.label ?? key;
                    return (
                        <span
                            key={key}
                            className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                            style={{ background: tokens[key], color: readableInk(tokens[key]) }}
                        >
                            {label}
                        </span>
                    );
                })}
            </div>

            <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] sm:grid-cols-3">
                {APPEARANCE_TOKEN_FIELDS.map((token) => (
                    <div key={token.name} className="flex min-w-0 items-center gap-1.5">
                        <dt className="shrink-0 opacity-55">{token.label}</dt>
                        <dd className="truncate font-mono opacity-80" title={tokens[token.name]}>
                            {tokens[token.name]}
                        </dd>
                    </div>
                ))}
            </dl>
        </div>
    );
}
