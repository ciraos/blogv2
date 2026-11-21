"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Eye, EyeOff, Info, Lightbulb, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
    AI_EMBEDDING_MODEL_OPTIONS,
    AI_PROVIDER_API_URLS,
    AI_PROVIDER_MODEL_EXAMPLES,
    AI_PROVIDER_MODEL_OPTIONS,
    AI_PROVIDER_OPTIONS,
    isFieldDirty,
    isSecretMask,
    recallAiProfileKey,
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

/**
 * 「这个模块算不算单独配置过」以 **API Key** 为准：
 *   · 没填 key = 没单独配置 → 沿用全局配置，卡片里给出提示；
 *   · 填了 key = 已单独配置（provider / model / api_url 都是围绕这把 key 的可选项）。
 * 之所以不再看 provider/model：key 才是「我为这个模块单独付账」的证据，
 * 只选了服务商却没给 key，实际跑起来仍然要靠全局。
 */
const MODULE_CONNECTION_KEYS: Record<string, string[]> = {
    summary: ["ai_summary_api_key"],
    writing: ["ai_writing_api_key"],
    assistant: ["ai_assistant.embedding_api_key"],
};

/** 摘要 / 写作两个模块的「提供商 → 地址 / 模型」联动键 */
const MODULE_PROVIDER_KEYS: Record<string, { provider: string; apiUrl: string; model: string }> = {
    ai_summary_provider: { provider: "ai_summary_provider", apiUrl: "ai_summary_api_url", model: "ai_summary_model" },
    ai_writing_provider: { provider: "ai_writing_provider", apiUrl: "ai_writing_api_url", model: "ai_writing_model" },
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

/** PRO 徽标（官方这四个模块标题都带；用琥珀色与橙色提示条同一色系） */
function ProBadge() {
    return (
        <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-amber-600 dark:text-amber-400">
            PRO
        </span>
    );
}

/** 主题色说明条：该模块未单独配置（没填 API Key）时提示「将使用全局配置」 */
function NotConfiguredNote({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-primary">
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
/**
 * 密钥输入框。
 *
 * 显示规则：
 *   · 没配过 / 正在输入 → 密码框，右侧眼睛切换明文；
 *   · 已配置（后端只回显掩码）→ 收起态显示 `sk-*****`，点输入框或眼睛即可清空重填。
 *
 * 说明：后端对密钥**只回显掩码**（`********`），已保存的 key 前端无法还原明文，
 * 眼睛能揭晓的只限「本次会话里刚输入的内容」。
 */
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
    /** 已保存掩码的状态下，用户点了输入框准备重新输入 */
    const [editing, setEditing] = useState(false);
    const masked = isSecretMask(value);
    const showStored = masked && !editing;

    if (showStored) {
        const startEditing = () => {
            setEditing(true);
            onChange("");
        };
        return (
            <div className="relative">
                <Input
                    id={id}
                    readOnly
                    value="sk-*****"
                    aria-label="已配置的密钥（已隐藏）"
                    title="已配置。点击可清空并重新填写"
                    onFocus={startEditing}
                    onClick={startEditing}
                    className="h-8 cursor-text pr-20 font-mono text-sm text-muted-foreground"
                />
                <div className="absolute inset-y-0 right-1 flex items-center gap-1">
                    <span className="rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">已配置</span>
                    <button
                        type="button"
                        aria-label="重新填写密钥"
                        title="重新填写密钥"
                        onClick={startEditing}
                        className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                        <Eye className="size-3.5" />
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="relative">
            <Input
                id={id}
                type={visible ? "text" : "password"}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder ?? "sk-..."}
                autoComplete="new-password"
                className="h-8 pr-9 font-mono text-sm"
            />
            <div className="absolute inset-y-0 right-1 flex items-center">
                <button
                    type="button"
                    onClick={() => setVisible((v) => !v)}
                    aria-label={visible ? "隐藏内容" : "显示内容"}
                    title={visible ? "隐藏" : "显示"}
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

/** 提供商下拉：已知 6 家 + 「自定义」（后端 Profile 的 provider 是自由字符串，线上就有 custom） */
const PROFILE_PROVIDER_OPTIONS = [...AI_PROVIDER_OPTIONS, { value: "custom", label: "自定义（custom）" }];

/** 新 Profile 的默认骨架；id 由前端生成（后端只 trim，不补 id） */
function createProfile(): Record<string, unknown> {
    return {
        id: `profile-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        name: "",
        provider: "custom",
        api_url: "",
        model: "",
        purpose: "通用",
        enabled: true,
        api_key: "",
        api_key_masked: "",
        has_api_key: false,
    };
}

/**
 * 「默认模型」下拉（**只能选，不能手填**）。
 *
 * 为什么不用原生 `<datalist>` / `<select>`：
 *  · `<datalist>` 的弹层是浏览器默认样式（白底、行距很大、不跟暗色令牌），在这套后台里很突兀；
 *  · `<select>` 没法在「选项还没拉回来」时优雅地展示「当前值 + 未获取」这两种状态。
 * 所以用主题令牌自绘一个：外观对齐 ui/select 的 trigger，选项列表是主题化的 popover。
 *
 * · 只能从 `options` 里选（值不在列表里时 trigger 仍显示它，只是不会高亮）；
 * · `options` 为空时整个控件禁用，title 里说明为什么；
 * · ↑/↓ 移动、Enter 选中、Esc 关闭、点外面关闭。
 */
function ModelSelect({
    value,
    options,
    placeholder,
    disabledHint,
    onChange,
}: {
    value: string;
    options: string[];
    placeholder?: string;
    /** options 为空时给个 title，说明为什么点不了（例如「先点获取上游模型」） */
    disabledHint?: string;
    onChange: (next: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(-1);
    const boxRef = useRef<HTMLDivElement>(null);
    /** combobox 与 listbox 的关联 id（a11y 规则要求 aria-controls） */
    const listboxId = useId();

    const disabled = options.length === 0;

    // 点弹层外面关掉
    useEffect(() => {
        if (!open) return;
        const onDown = (event: MouseEvent) => {
            if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", onDown);
        return () => document.removeEventListener("mousedown", onDown);
    }, [open]);

    const choose = (next: string) => {
        onChange(next);
        setOpen(false);
        setActive(-1);
    };

    const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
        if (event.key === "Escape") {
            setOpen(false);
            return;
        }
        if (disabled) return;
        if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            setActive((index) => Math.min(options.length - 1, index + 1));
        } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            setActive((index) => Math.max(0, index - 1));
        } else if ((event.key === "Enter" || event.key === " ") && open && active >= 0 && options[active]) {
            event.preventDefault();
            choose(options[active]);
        }
    };

    return (
        <div ref={boxRef} className="relative">
            <button
                type="button"
                role="combobox"
                aria-expanded={open}
                aria-haspopup="listbox"
                aria-controls={open ? listboxId : undefined}
                disabled={disabled}
                title={disabled ? disabledHint : undefined}
                onClick={() => {
                    if (disabled) return;
                    setOpen((v) => !v);
                    setActive(-1);
                }}
                onKeyDown={onKeyDown}
                className={cn(
                    "flex h-8 w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent px-2.5 text-sm whitespace-nowrap transition-colors outline-none",
                    "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 dark:hover:bg-input/50",
                    "disabled:cursor-not-allowed disabled:opacity-60"
                )}
            >
                <span className={cn("truncate font-mono text-left", value ? "text-foreground" : "text-muted-foreground")}>
                    {value || placeholder || "选择模型"}
                </span>
                <ChevronDown
                    className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
                    aria-hidden
                />
            </button>
            {open && !disabled && (
                <div
                    role="listbox"
                    id={listboxId}
                    className="absolute inset-x-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg"
                >
                    {options.map((name, index) => (
                        <button
                            key={name}
                            type="button"
                            role="option"
                            aria-selected={name === value}
                            onMouseDown={(event) => event.preventDefault()}
                            onMouseEnter={() => setActive(index)}
                            onClick={() => choose(name)}
                            className={cn(
                                "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left font-mono text-xs transition-colors",
                                index === active ? "bg-muted text-foreground" : "text-muted-foreground",
                                name === value && "text-primary"
                            )}
                        >
                            <span className="truncate">{name}</span>
                            {name === value && <Check className="size-3.5 shrink-0" aria-hidden />}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

/**
 * 单个 AI Profile 卡片（`settings.ai_profiles` 的一项）。
 *
 * 密钥规则（与后端 prepareAIProfilesSettingForSave 对齐）：
 *  · 输入框只用于「这次要换 key」，留空 = 保留已存的（后端按 profile.id 沿用旧 key）；
 *  · 因此提交上去的 api_key 只可能是新值；
 *  · 已存的 key 不做回显（列表里不显示掩码，避免把密钥痕迹摊在页面上）；
 *    只有「获取上游模型」需要真 key 时才从本次会话的内存缓存里取（recallAiProfileKey）。
 */
function ProfileCard({
    profile,
    index,
    onPatch,
    onRemove,
}: {
    profile: Record<string, unknown>;
    index: number;
    onPatch: (patch: Record<string, unknown>) => void;
    onRemove: () => void;
}) {
    const [visible, setVisible] = useState(false);
    /** 「获取上游模型」拉到的候选（只在本卡片里用于「默认模型」的下拉候选） */
    const [models, setModels] = useState<string[]>([]);
    const [loadingModels, setLoadingModels] = useState(false);

    const id = String(profile.id ?? "");
    const provider = String(profile.provider ?? "");
    const model = String(profile.model ?? "");
    const newKey = String(profile.api_key ?? "");
    const storedPlain = recallAiProfileKey(id);
    const knownProvider = PROFILE_PROVIDER_OPTIONS.some((option) => option.value === provider);
    const apiUrl = String(profile.api_url ?? "");
    /** 上游调用要真 key：优先用这次输入的，其次用本次会话读到的明文（后端只回掩码时就没有） */
    const effectiveKey = newKey.trim() || storedPlain;
    // 三项都填好才允许去拉模型（没 key 拉了也是 401，省得白跑一趟）
    const canFetchModels = Boolean(provider.trim() && apiUrl.trim() && effectiveKey);

    /**
     * 是否已存过密钥。v1.9.5 起后端只回掩码（`api_key_masked` + `has_api_key`），
     * 不再回明文 —— 所以「已配置」要靠这两个字段判断，不能只看有没有明文。
     */
    const maskedKey = String(profile.api_key_masked ?? "");
    const hasStoredKey = profile.has_api_key === true || Boolean(maskedKey) || Boolean(storedPlain);

    /** 「获取上游模型」点不了时的原因：分清「没填」和「填了但后端不回明文」两种情况 */
    const fetchDisabledReason = canFetchModels
        ? null
        : !provider.trim() || !apiUrl.trim()
          ? "填好提供商、API 地址和 API Key 后可用"
          : hasStoredKey
            ? "已保存的 Key 不再回显，重新输入一次才能拉取上游模型"
            : "填写 API Key 后才能拉取上游模型";

    const handleProvider = (next: string) => {
        const patch: Record<string, unknown> = { provider: next };
        // 换服务商 → API 地址跟着预填（仍可手改）；模型不动，避免把别家的模型名留在框里
        const url = AI_PROVIDER_API_URLS[next];
        if (url) patch.api_url = url;
        onPatch(patch);
        // 换了服务商，之前的模型列表就不作数了
        setModels([]);
    };

    /** 拉上游 /models：服务端代取（浏览器直连会被 CORS 拦），见 src/app/api/admin/ai/models/route.ts */
    const fetchModels = async () => {
        if (!canFetchModels || loadingModels) return;
        setLoadingModels(true);
        try {
            const res = await fetch("/api/admin/ai/models", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ api_url: apiUrl, api_key: effectiveKey }),
            });
            const json = (await res.json().catch(() => null)) as
                | { code?: number; message?: string; data?: { models?: string[] } }
                | null;
            const list = json?.data?.models ?? [];
            if (!res.ok || list.length === 0) {
                setModels([]);
                toast.error(json?.message || "获取模型失败");
                return;
            }
            setModels(list);
            toast.success(`获取到 ${list.length} 个模型，可在「默认模型」里选`);
        } catch {
            setModels([]);
            toast.error("获取模型失败：网络异常");
        } finally {
            setLoadingModels(false);
        }
    };

    return (
        <div className="rounded-lg border bg-background/40 p-3">
            <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 text-[11px] font-medium text-muted-foreground">Profile {index + 1}</span>
                    <Input
                        value={String(profile.name ?? "")}
                        onChange={(e) => onPatch({ name: e.target.value })}
                        placeholder="名称（例如 new-api）"
                        className="h-8 max-w-56 text-sm"
                        aria-label={`Profile ${index + 1} 名称`}
                    />
                </div>
                <div className="flex shrink-0 items-center gap-2">
                    {/* Switch 的可见部分是个 span、真正的 checkbox 是 sr-only，必须裹 label 才点得动 */}
                    <label className="cursor-pointer" title={profile.enabled === true ? "停用这个 Profile" : "启用这个 Profile"}>
                        <Switch
                            checked={profile.enabled === true}
                            label={`启用 Profile ${index + 1}`}
                            onChange={(next) => onPatch({ enabled: next })}
                        />
                    </label>
                    <button
                        type="button"
                        onClick={onRemove}
                        title="删除这个 Profile"
                        aria-label={`删除 Profile ${index + 1}`}
                        className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    >
                        <Trash2 className="size-3.5" />
                    </button>
                </div>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">提供商</Label>
                    <Select value={knownProvider ? provider : "custom"} onValueChange={handleProvider}>
                        <SelectTrigger className="h-8 w-full">
                            <SelectValue placeholder="选择提供商" />
                        </SelectTrigger>
                        <SelectContent>
                            {PROFILE_PROVIDER_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">用途</Label>
                    <Input
                        value={String(profile.purpose ?? "")}
                        onChange={(e) => onPatch({ purpose: e.target.value })}
                        placeholder="通用 / 写作 / 摘要"
                        className="h-8 text-sm"
                    />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs text-muted-foreground">API 地址</Label>
                    <Input
                        value={apiUrl}
                        onChange={(e) => onPatch({ api_url: e.target.value })}
                        placeholder="https://api.example.com/v1"
                        className="h-8 font-mono text-sm"
                    />
                </div>
                <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">API Key</Label>
                    <div className="relative">
                        <Input
                            type={visible ? "text" : "password"}
                            value={newKey}
                            onChange={(e) => onPatch({ api_key: e.target.value })}
                            placeholder="sk-xxxx"
                            autoComplete="new-password"
                            className="h-8 pr-9 font-mono text-sm"
                        />
                        <div className="absolute inset-y-0 right-1 flex items-center">
                            <button
                                type="button"
                                onClick={() => setVisible((v) => !v)}
                                aria-label={visible ? "隐藏刚输入的 Key" : "显示刚输入的 Key"}
                                className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            >
                                {visible ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                            </button>
                        </div>
                    </div>
                </div>
                <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">默认模型</Label>
                    <ModelSelect
                        value={model}
                        options={models}
                        onChange={(next) => onPatch({ model: next })}
                        placeholder={provider ? (AI_PROVIDER_MODEL_EXAMPLES[provider] ?? "选择模型") : "选择模型"}
                        disabledHint="先点下方「获取上游模型」，拉到候选后才可选"
                    />
                </div>
                {/* 「获取上游模型」放在「默认模型」正下方：它拉到的就是这一格的候选 */}
                <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
                    <button
                        type="button"
                        onClick={() => void fetchModels()}
                        disabled={!canFetchModels || loadingModels}
                        title={
                            canFetchModels
                                ? "请求上游 {地址}/models，把拿到的模型填进「默认模型」的候选"
                                : (fetchDisabledReason ?? "")
                        }
                        className="inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border disabled:hover:text-muted-foreground"
                    >
                        {loadingModels ? (
                            <Loader2 className="size-3.5 animate-spin" aria-hidden />
                        ) : (
                            <RefreshCw className="size-3.5" aria-hidden />
                        )}
                        {loadingModels ? "获取中…" : "获取上游模型"}
                    </button>
                    <span className="text-[11px] text-muted-foreground">
                        {canFetchModels
                            ? models.length > 0
                                ? `已获取 ${models.length} 个模型`
                                : "从上游 /models 拉取「默认模型」的候选"
                            : (fetchDisabledReason ?? "")}
                    </span>
                </div>
            </div>
        </div>
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
 * 全局配置区（`settings.ai_profiles`）：
 *  - 值是一段 JSON 数组，后端读时会被解析成数组对象、写时按字符串收（见 admin-settings 的 ai_profiles 字段）。
 *  - 这里按 Profile 卡片渲染：可增删、可改 provider / api_url / model / purpose / enabled。
 *  - 密钥只写不回显：已存的 key 显示掩码（点「显示」展开本次会话读到的明文），编辑时留空即保留
 *    （后端 prepareAIProfilesSettingForSave 按 profile.id 沿用旧 key）。
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

    /** settings.ai_profiles：多 Profile 数组（toFormValue 已归一化成「无明文 key」的形状） */
    const profiles = Array.isArray(draft["ai_profiles"]) ? (draft["ai_profiles"] as Record<string, unknown>[]) : [];
    const setProfiles = (next: Record<string, unknown>[]) => onChange("ai_profiles", next);
    const addProfile = () => setProfiles([...profiles, createProfile()]);

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

    /**
     * 切换提供商时的联动（对齐用户预期：换服务商，地址与模型跟着换）：
     * · API 地址：**直接**预填新服务商的默认地址（预填后仍可手改）；
     * · 模型：清空，输入框只留「例如 xxx」的示例占位 —— 各家模型名互不通用，
     *   把旧服务商的模型名留在框里只会让人以为还能用。
     *   若当前模型恰好也是新服务商的候选模型，则保留。
     */
    const handleProviderChange = (fieldKey: string, nextProvider: string) => {
        onChange(fieldKey, nextProvider);
        const map = MODULE_PROVIDER_KEYS[fieldKey];
        if (!map) return;

        const nextUrl = AI_PROVIDER_API_URLS[nextProvider] ?? "";
        if (nextUrl) onChange(map.apiUrl, nextUrl);

        const currentModel = text(map.model).trim();
        const stillValid = (AI_PROVIDER_MODEL_OPTIONS[nextProvider] ?? []).some((o) => o.value === currentModel);
        if (!stillValid) onChange(map.model, "");
    };

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
            // 摘要 / 写的模型：普通输入框 + 「例如 xxx」占位，随提供商变化；
            // 助手（向量化）模型仍保留候选列表，那是有限枚举。
            const source = MODEL_SOURCES[field.key];
            const providerValue = source ? text(source.providerKey) : "";
            const example = AI_PROVIDER_MODEL_EXAMPLES[providerValue] ?? "";
            const isEmbedding = field.key === "ai_assistant.embedding_model";

            if (!isEmbedding) {
                return (
                    <Input
                        id={controlId}
                        value={value}
                        onChange={(e) => set(e.target.value)}
                        placeholder={example ? `例如 ${example}` : "例如 gpt-4o-mini"}
                        className="h-8 text-sm"
                    />
                );
            }

            const options = (source && providerValue ? source.options[providerValue] : undefined) ?? [];
            return (
                <ModelSelect
                    value={value}
                    options={options.map((option) => option.value)}
                    onChange={set}
                    placeholder={providerValue ? "选择模型" : "请先选择向量化服务商"}
                    disabledHint="先选一个向量化服务商，才有模型候选"
                />
            );
        }

        if (field.aiControl === "select") {
            const current = value.trim();
            const options = field.options ?? [];
            const linkable = Boolean(MODULE_PROVIDER_KEYS[field.key]);
            return (
                <Select value={current || undefined} onValueChange={linkable ? (next) => handleProviderChange(field.key, next) : set}>
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

    const card = "soft-surface p-4";
    const podcastSwitch = byKey.get("ai_podcast.enable");
    const assistantSwitch = byKey.get("ai_assistant.enable");
    const podcastOn = draft["ai_podcast.enable"] === true;
    const assistantOn = draft["ai_assistant.enable"] === true;

    return (
        <div className="space-y-4">
            {/* ---------- 全局配置：settings.ai_profiles（多 Profile，可增删改） ---------- */}
            <div className={card}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                        AI 全局配置
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
                            {profiles.length} 个 Profile
                        </span>
                    </div>
                    <button
                        type="button"
                        onClick={addProfile}
                        className="h-7 w-max rounded-md border px-2.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                    >
                        + 添加 Profile
                    </button>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    未单独配置的模块沿用这里的默认值。密钥只写不回显：编辑时留空即保留已存的 Key。
                </p>

                {profiles.length === 0 ? (
                    <div className="mt-3 rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
                        还没有 Profile。点「添加 Profile」填一条（提供商 + API 地址 + 模型 + Key），AI 写作 / 摘要才有可用的连接。
                    </div>
                ) : (
                    <div className="mt-3 space-y-3">
                        {profiles.map((profile, index) => (
                            <ProfileCard
                                key={String(profile.id ?? index)}
                                profile={profile}
                                index={index}
                                onPatch={(patch) =>
                                    setProfiles(profiles.map((item, i) => (i === index ? { ...item, ...patch } : item)))
                                }
                                onRemove={() => setProfiles(profiles.filter((_, i) => i !== index))}
                            />
                        ))}
                    </div>
                )}
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
                {allEmpty(MODULE_CONNECTION_KEYS.summary) && (
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
                {allEmpty(MODULE_CONNECTION_KEYS.writing) && (
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
                ) : null}
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
                ) : null}
            </div>
        </div>
    );
}
