"use client";

import { useMemo, useState } from "react";
import { Eye, EyeOff, Info, Lightbulb } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    AI_EMBEDDING_MODEL_OPTIONS,
    AI_PROVIDER_MODEL_OPTIONS,
    isFieldDirty,
    isSecretMask,
    type SettingsField,
    type SettingsFormValue,
} from "@/lib/admin-settings";

type Draft = Record<string, SettingsFormValue>;

/** 「模型」下拉的候选来源：按模块的 provider 字段选对应模型表（仍允许自由输入，见 ModelInput） */
const MODEL_SOURCES: Record<string, { providerKey: string; options: Record<string, { value: string; label: string }[]> }> = {
    ai_summary_model: { providerKey: "ai_summary_provider", options: AI_PROVIDER_MODEL_OPTIONS },
    ai_writing_model: { providerKey: "ai_writing_provider", options: AI_PROVIDER_MODEL_OPTIONS },
    "ai_assistant.embedding_model": { providerKey: "ai_assistant.embedding_provider", options: AI_EMBEDDING_MODEL_OPTIONS },
};

/** 各模块的字段（开关单独渲染在标题下方，与官方同款结构） */
const MODULE_FIELD_KEYS: Record<string, string[]> = {
    summary: ["ai_summary_provider", "ai_summary_api_key", "ai_summary_api_url", "ai_summary_model", "ai_summary_system_prompt"],
    writing: [
        "ai_writing_provider",
        "ai_writing_api_key",
        "ai_writing_api_url",
        "ai_writing_model",
        "ai_writing_max_tokens",
        "ai_writing_temperature",
        "ai_writing_system_prompt",
    ],
    podcast: [
        "ai_podcast.provider",
        "ai_podcast.speaker1",
        "ai_podcast.speaker2",
        "ai_podcast.audio_format",
        "ai_podcast.sample_rate",
        "ai_podcast.speech_rate",
        "ai_podcast.use_head_music",
        "ai_podcast.use_tail_music",
        "ai_podcast.button_text",
        "ai_podcast.button_icon",
    ],
    assistant: [
        "ai_assistant.name",
        "ai_assistant.welcome",
        "ai_assistant.chat_suggestions",
        "ai_assistant.search_suggestions",
        "ai_assistant.embedding_provider",
        "ai_assistant.embedding_api_key",
        "ai_assistant.embedding_model",
        "ai_assistant.vector_store",
        "ai_assistant.system_prompt",
        "ai_assistant.user_prompt",
        "ai_assistant.no_context_prompt",
    ],
};

/**
 * 「检测到历史配置」的判据字段 —— 刻意与官方不同。
 *
 * 官方 AISettingsForm.tsx:201-237 把 button_text / button_icon / name / welcome / 建议词这些
 * **后端本来就有默认值**的键也算进「历史配置」：线上 /public/site-config 实测
 * ai_podcast.button_text = "AI 播客"、button_icon = "ri:mic-fill"、ai_assistant.name = "AI 助手"，
 * 照官方的列表判断，只要开关是关的就必然命中 → 会无条件显示「检测到历史配置已保留」，
 * 这是拿一句写死的话骗人。
 *
 * 所以这里只统计**真正由管理员填过、后端没有默认值**的键（提供商/凭据/音色/音频参数/Prompt/向量库）：
 * 这些键全空就不显示提示（宁可不说，也不编）。
 */
const MODULE_HISTORY_KEYS: Record<string, string[]> = {
    podcast: [
        "ai_podcast.provider",
        "ai_podcast.speaker1",
        "ai_podcast.speaker2",
        "ai_podcast.use_head_music",
        "ai_podcast.use_tail_music",
        "ai_podcast.audio_format",
        "ai_podcast.sample_rate",
        "ai_podcast.speech_rate",
    ],
    assistant: [
        "ai_assistant.embedding_provider",
        "ai_assistant.embedding_api_key",
        "ai_assistant.embedding_model",
        "ai_assistant.vector_store",
        "ai_assistant.system_prompt",
        "ai_assistant.user_prompt",
        "ai_assistant.no_context_prompt",
    ],
};

/** PRO 徽标（官方这四个模块标题都带；用琥珀色与橙色提示条同一色系） */
function ProBadge() {
    return (
        <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-amber-600 dark:text-amber-400">
            PRO
        </span>
    );
}

/** 蓝色说明条：该模块字段全空时提示「未单独配置」 */
function NotConfiguredNote({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex items-start gap-2 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs text-sky-700 dark:text-sky-300">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>{children}</span>
        </div>
    );
}

/** 橙黄色说明条：开关关闭但检测到管理员填过的配置 */
function HistoryKeptNote({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>{children}</span>
        </div>
    );
}

/** 浅色「Prompt 建议」卡：条目名词用红色（官方同款视觉） */
function PromptAdvice({
    title,
    subtitle,
    items,
}: {
    title: string;
    subtitle?: string;
    items: { variable: string; description: string }[];
}) {
    return (
        <div className="rounded-lg border border-border/60 bg-muted/40 p-3">
            <div className="flex items-center gap-1.5 text-xs font-medium text-foreground/80">
                <Lightbulb className="size-3.5 text-amber-500" aria-hidden />
                {title}
            </div>
            {subtitle && <div className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</div>}
            <ul className="mt-2 space-y-1">
                {items.map((item) => (
                    <li key={item.variable} className="text-[11px] leading-relaxed text-muted-foreground">
                        <span className="font-medium text-rose-500">{item.variable}</span>
                        <span className="mx-1">·</span>
                        {item.description}
                    </li>
                ))}
            </ul>
        </div>
    );
}

/** 敏感项输入框：掩码回显 + 眼睛切换；未改动不会进保存载荷（判定见 admin-settings.isFieldDirty） */
function SecretInput({
    id,
    value,
    placeholder,
    onChange,
}: {
    id: string;
    value: string;
    placeholder?: string;
    onChange: (next: string) => void;
}) {
    const [visible, setVisible] = useState(false);
    const masked = isSecretMask(value);

    return (
        <div className="relative">
            <Input
                id={id}
                type={visible ? "text" : "password"}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder ?? "未配置"}
                autoComplete="new-password"
                className="h-8 pr-20 text-sm"
            />
            <div className="absolute inset-y-0 right-1 flex items-center gap-1">
                {masked && (
                    <span
                        className="rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground"
                        title="后端只回显掩码，不会明文回显"
                    >
                        已配置
                    </span>
                )}
                <button
                    type="button"
                    onClick={() => setVisible((v) => !v)}
                    aria-label={visible ? "隐藏内容" : "显示内容"}
                    className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                    {visible ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                </button>
            </div>
        </div>
    );
}

/** 开关（本站没有 ui/switch，这里用令牌描一个；比复选框更贴官方那把开关） */
function Switch({ checked, label, onChange }: { checked: boolean; label: string; onChange: (next: boolean) => void }) {
    return (
        <span
            className={`relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors ${
                checked ? "border-primary bg-primary" : "border-border bg-muted"
            }`}
        >
            <input
                type="checkbox"
                checked={checked}
                onChange={(e) => onChange(e.target.checked)}
                aria-label={label}
                className="peer sr-only"
            />
            <span
                className={`pointer-events-none absolute left-0.5 size-3.5 rounded-full bg-card shadow-sm transition-transform ${
                    checked ? "translate-x-4" : ""
                }`}
            />
        </span>
    );
}

/**
 * AI 设置面板（对齐官方 components/admin/settings/AISettingsForm.tsx 的信息架构）。
 *
 * 为什么整块由它渲染而不是走 FieldControl：官方这套面板有「模块标题 + PRO 徽标 + 开关行 +
 * 模块级提示条 + Prompt 建议卡」这些跨字段结构，逐字段渲染表达不了。
 * 字段本身仍登记在 src/lib/admin-settings.ts 的 schema 里 —— 基线、改动判定、保存载荷
 * 全部复用设置页既有机制（草稿 → 底部保存条），这里只负责画。
 *
 * 诚实边界：
 *  - 用户截图里的「AI Profile（默认 Profile 下拉 + 添加 Profile）」在本后端版本没有对应键：
 *    快照 setting-keys.ts 与 setting-descriptors.ts:901-975 里搜不到任何 profile 键或接口，
 *    只有每个模块自带的 provider/api_key/api_url/model（legacy 单配置）。
 *    所以不画「+ 添加 Profile」这种按了没反应的控件，只给说明。
 *  - 同理没有「全局 AI」键，所以不提供全局填写框（写了后端也不认），只按模块展示当前值。
 */
export function AiSettingsPanel({
    fields,
    draft,
    baseline,
    onChange,
}: {
    fields: SettingsField[];
    draft: Draft;
    baseline: Draft;
    onChange: (key: string, value: SettingsFormValue) => void;
}) {
    const byKey = useMemo(() => new Map(fields.map((field) => [field.key, field])), [fields]);

    const text = (key: string) => String(draft[key] ?? "");

    /** 一组键是否全空（用于「未单独配置」提示；布尔 false 与空数组都算空） */
    const allEmpty = (keys: string[]) =>
        keys.every((key) => {
            const value = draft[key];
            if (typeof value === "boolean") return value === false;
            if (Array.isArray(value)) return value.length === 0;
            return String(value ?? "").trim() === "";
        });

    const rowsFor = (module: string) =>
        (MODULE_FIELD_KEYS[module] ?? [])
            .map((key) => byKey.get(key))
            .filter((field): field is SettingsField => Boolean(field));

    /** 单个字段的控件（按 aiControl / type 分派） */
    const renderControl = (field: SettingsField) => {
        const value = text(field.key);
        const set = (next: string) => onChange(field.key, next);
        const controlId = `ai-${field.key.replace(/\./g, "-")}`;

        if (field.type === "stringlist") {
            const items = Array.isArray(draft[field.key]) ? (draft[field.key] as string[]) : [];
            return (
                <div className="space-y-1.5">
                    {items.map((item, index) => (
                        <div key={`${field.key}-${index}`} className="flex items-center gap-2">
                            <Input
                                value={item}
                                onChange={(e) => {
                                    const next = [...items];
                                    next[index] = e.target.value;
                                    onChange(field.key, next);
                                }}
                                placeholder={field.placeholder}
                                className="h-8 text-sm"
                            />
                            <button
                                type="button"
                                onClick={() => onChange(field.key, items.filter((_, i) => i !== index))}
                                className="h-8 shrink-0 rounded-md border px-2 text-xs text-muted-foreground transition-colors hover:border-destructive hover:text-destructive"
                            >
                                删除
                            </button>
                        </div>
                    ))}
                    <button
                        type="button"
                        onClick={() => onChange(field.key, [...items, ""])}
                        className="h-8 rounded-md border px-2 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                    >
                        添加一条
                    </button>
                </div>
            );
        }

        if (field.aiControl === "model") {
            // Radix Select 不允许自由文本，所以模型用 input + datalist：可选可输入
            const source = MODEL_SOURCES[field.key];
            const providerValue = source ? text(source.providerKey) : "";
            const options = (source && providerValue ? source.options[providerValue] : undefined) ?? [];
            const disabled = !providerValue;
            return (
                <div>
                    <Input
                        id={controlId}
                        list={`ai-${field.key.replace(/\./g, "-")}-models`}
                        value={value}
                        disabled={disabled}
                        onChange={(e) => set(e.target.value)}
                        placeholder={disabled ? "请先选择提供商" : field.placeholder ?? "从列表选择或直接输入模型名"}
                        className="h-8 text-sm"
                    />
                    <datalist id={`ai-${field.key.replace(/\./g, "-")}-models`}>
                        {options.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </datalist>
                    {disabled && <p className="mt-1 text-[11px] text-muted-foreground">请先选择提供商，然后可从列表选择或直接输入自定义模型名称</p>}
                </div>
            );
        }

        if (field.aiControl === "select") {
            const current = value.trim();
            const options = field.options ?? [];
            return (
                <Select value={current || undefined} onValueChange={set}>
                    <SelectTrigger id={controlId} className="h-8 w-full">
                        <SelectValue placeholder={field.placeholder ?? "请选择"} />
                    </SelectTrigger>
                    <SelectContent>
                        {options.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                                {option.label}
                            </SelectItem>
                        ))}
                        {/* 后端可能存着选项表里没有的值（自定义/旧值）：补一条，免得显示成空的 */}
                        {current && !options.some((option) => option.value === current) && (
                            <SelectItem value={current}>{current}（当前值）</SelectItem>
                        )}
                    </SelectContent>
                </Select>
            );
        }

        if (field.aiControl === "textarea") {
            return (
                <textarea
                    id={controlId}
                    value={value}
                    onChange={(e) => set(e.target.value)}
                    rows={field.key.includes("system_prompt") ? 5 : 4}
                    placeholder={field.placeholder}
                    className="w-full resize-y rounded-lg border border-input bg-transparent px-3 py-2 text-sm leading-relaxed outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                />
            );
        }

        if (field.sensitive) {
            return <SecretInput id={controlId} value={value} placeholder={field.placeholder} onChange={set} />;
        }

        return (
            <Input
                id={controlId}
                type={field.aiControl === "number" ? "number" : "text"}
                value={value}
                onChange={(e) => set(e.target.value)}
                placeholder={field.placeholder}
                className="h-8 text-sm"
            />
        );
    };

    /** 字段网格：textarea / stringlist 独占整行，其余两列（官方布局也一样） */
    const fieldGrid = (module: string) => (
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-2">
            {rowsFor(module)
                .filter((field) => field.type !== "boolean")
                .map((field) => {
                    const wide = field.wide || field.type === "stringlist" || field.aiControl === "textarea";
                    const controlId = `ai-${field.key.replace(/\./g, "-")}`;
                    return (
                        <div key={field.key} className={wide ? "md:col-span-2" : undefined}>
                            <Label
                                htmlFor={controlId}
                                className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
                            >
                                <span className="shrink-0 whitespace-nowrap">{field.label}</span>
                                {isFieldDirty(field, draft, baseline) && (
                                    <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-label="已改动" />
                                )}
                                {field.aiControl === "textarea" && (
                                    <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">文本</span>
                                )}
                                {field.sensitive && isSecretMask(draft[field.key]) && (
                                    <span className="shrink-0 text-[10px] text-muted-foreground">已配置（不回显）</span>
                                )}
                            </Label>
                            {field.hint && <p className="mb-1.5 text-[11px] text-muted-foreground/80">{field.hint}</p>}
                            {renderControl(field)}
                        </div>
                    );
                })}
        </div>
    );

    /** 开关行：左侧标题（+ PRO 标）+ 下方说明，开关在右（官方同款结构） */
    const switchRow = (field: SettingsField) => (
        <label className="flex cursor-pointer items-start justify-between gap-3 rounded-lg border px-3 py-2.5">
            <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                    {field.label}
                    <ProBadge />
                </span>
                {field.hint && <span className="mt-0.5 block text-[11px] text-muted-foreground">{field.hint}</span>}
            </span>
            <Switch checked={draft[field.key] === true} label={field.label} onChange={(next) => onChange(field.key, next)} />
        </label>
    );

    const card = "rounded-xl border bg-card p-4 shadow-sm";
    const podcastSwitch = byKey.get("ai_podcast.enable");
    const assistantSwitch = byKey.get("ai_assistant.enable");
    const podcastOn = draft["ai_podcast.enable"] === true;
    const assistantOn = draft["ai_assistant.enable"] === true;

    return (
        <div className="space-y-4">
            {/* ---------- 全局说明（本后端版本没有全局键 / Profile 键，按事实说明） ---------- */}
            <div className={card}>
                <div className="flex items-center gap-2 text-sm font-semibold">
                    AI 全局配置
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">说明</span>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    各功能模块未单独配置时，后端会按自身默认值处理（官方默认提供商为 glm）。
                </p>
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                    <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    <div className="space-y-1">
                        <div>
                            <span className="font-medium text-foreground/80">本后端版本没有「全局 AI 键」，也没有多套 AI Profile：</span>
                            官方快照（setting-keys.ts / setting-descriptors.ts:901-975）里只有每个模块自带的
                            provider / api_key / api_url / model，搜不到任何 profile 键或 profile 接口。
                        </div>
                        <div>
                            所以这里不提供「默认 Profile」下拉与「+ 添加 Profile」按钮，也不提供全局填写框 ——
                            写了后端不认识的键只会静默丢失；按模块分别配置即可。
                        </div>
                    </div>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {[
                        { label: "AI 摘要", provider: text("ai_summary_provider"), model: text("ai_summary_model") },
                        { label: "AI 写作", provider: text("ai_writing_provider"), model: text("ai_writing_model") },
                        { label: "AI 播客", provider: text("ai_podcast.provider"), model: "" },
                        {
                            label: "AI 助手",
                            provider: text("ai_assistant.embedding_provider"),
                            model: text("ai_assistant.embedding_model"),
                        },
                    ].map((row) => (
                        <div key={row.label} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs">
                            <span className="shrink-0 text-muted-foreground">{row.label}</span>
                            <span className="min-w-0 truncate text-right">
                                {row.provider || row.model ? (
                                    <>
                                        {row.provider || "未选提供商"}
                                        {row.model ? ` · ${row.model}` : ""}
                                    </>
                                ) : (
                                    <span className="text-muted-foreground">未单独配置 → 走后端默认</span>
                                )}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            {/* ---------- AI 摘要 ---------- */}
            <div className={card}>
                <div className="flex items-center gap-2 text-sm font-semibold">
                    AI 摘要
                    <ProBadge />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                    用于文章摘要生成。建议先确认模型可访问，再逐步调整 Prompt，避免一次改动过大导致效果不可控。
                </p>
                {allEmpty(MODULE_FIELD_KEYS.summary) && (
                    <div className="mt-3">
                        <NotConfiguredNote>
                            未单独配置，将使用全局 AI 配置；填写下方字段可为本模块单独指定提供商与密钥。
                        </NotConfiguredNote>
                    </div>
                )}
                <div className="mt-3 space-y-3">
                    {fieldGrid("summary")}
                    <PromptAdvice
                        title="Prompt 配置建议"
                        items={[
                            { variable: "长度约束", description: "例如 100-200 字、单段输出" },
                            { variable: "语气约束", description: "例如客观、中性、避免营销语" },
                            { variable: "事实约束", description: "例如无依据时不要臆测" },
                        ]}
                    />
                </div>
            </div>

            {/* ---------- AI 写作 ---------- */}
            <div className={card}>
                <div className="flex items-center gap-2 text-sm font-semibold">
                    AI 写作
                    <ProBadge />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                    用于生成文章初稿。建议优先设置模型与温度，再通过 System Prompt 固定结构和风格。
                </p>
                {allEmpty(MODULE_FIELD_KEYS.writing) && (
                    <div className="mt-3">
                        <NotConfiguredNote>
                            未单独配置，将使用全局 AI 配置；填写下方字段可为本模块单独指定提供商与密钥。
                        </NotConfiguredNote>
                    </div>
                )}
                <div className="mt-3 space-y-3">
                    {fieldGrid("writing")}
                    <PromptAdvice
                        title="写作 Prompt 建议"
                        subtitle="可通过规则化描述让输出更稳定"
                        items={[
                            { variable: "结构要求", description: "例如：前言、正文分节、总结" },
                            { variable: "格式要求", description: "例如：输出 Markdown，代码块必须标注语言" },
                            { variable: "准确性要求", description: "例如：不确定的信息要显式说明" },
                        ]}
                    />
                </div>
            </div>

            {/* ---------- AI 播客 ---------- */}
            <div className={card}>
                <div className="flex items-center gap-2 text-sm font-semibold">
                    AI 播客
                    <ProBadge />
                </div>
                {podcastSwitch && <div className="mt-3">{switchRow(podcastSwitch)}</div>}
                {podcastOn ? (
                    <div className="mt-3 space-y-3">
                        {fieldGrid("podcast")}
                        <div className="rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
                            火山引擎的 app_id / access_key / resource_id 属凭据，按本站「凭据不进设置页」的政策不在此维护；
                            另外当前后端也没有播客生成接口（前台入口只做诚实提示，不生成音频）。
                        </div>
                    </div>
                ) : (
                    <div className="mt-3">
                        {!allEmpty(MODULE_HISTORY_KEYS.podcast) ? (
                            <HistoryKeptNote>AI 播客当前关闭，但检测到历史配置已保留；重新开启后会继续生效。</HistoryKeptNote>
                        ) : (
                            <p className="text-xs text-muted-foreground">
                                未开启。开启后文章页会显示 AI 播客按钮（当前后端未提供生成接口，前台只做诚实提示）。
                            </p>
                        )}
                    </div>
                )}
            </div>

            {/* ---------- AI 助手 ---------- */}
            <div className={card}>
                <div className="flex items-center gap-2 text-sm font-semibold">
                    AI 助手
                    <ProBadge />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                    用于站点问答与检索增强。建议先确认 Embedding 与向量库可用，再调 Prompt 模板。
                </p>
                {assistantSwitch && <div className="mt-3">{switchRow(assistantSwitch)}</div>}
                {assistantOn ? (
                    <div className="mt-3 space-y-3">
                        {fieldGrid("assistant")}
                        <PromptAdvice
                            title="助手 Prompt 可用占位符"
                            subtitle="变量由系统在运行时自动替换"
                            items={[
                                { variable: "{{context}}", description: "检索到的站点内容片段" },
                                { variable: "{{question}}", description: "用户当前问题" },
                                { variable: "{{site_name}}", description: "站点名称" },
                            ]}
                        />
                    </div>
                ) : (
                    <div className="mt-3">
                        {!allEmpty(MODULE_HISTORY_KEYS.assistant) ? (
                            <HistoryKeptNote>AI 助手当前关闭，但检测到历史配置已保留；重新开启后会继续生效。</HistoryKeptNote>
                        ) : (
                            <p className="text-xs text-muted-foreground">
                                未开启。开启后站点会显示 AI 助手入口（当前后端未提供对话接口，前台只展示配置预览）。
                            </p>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
