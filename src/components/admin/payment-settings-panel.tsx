"use client";

// 系统设置 · 高级功能 · 支付配置面板。
//
// 为什么是一块自定义面板而不是普通配置字段：支付配置**不在设置表里**（社区版
// internal/configdef 里没有任何 payment 键），PRO 侧给的是一组独立接口
// （/pro/payment/config/details、/{slug}、/{PROVIDER}/toggle、/{PROVIDER}/test），
// 每种支付方式各有自己的字段集合与各自的保存/测试/启停动作，逐字段塞进通用表单表达不了。
// 草稿与保存也走不到 settings-manager 那套「点右下角保存」的机制，所以面板内部自管。
//
// 接口与字段来源（非猜测）：官方前端 src/lib/api/payment.ts:11-157 与
// components/admin/settings/PaymentSettingsForm.tsx；线上只读探活四个路径均 401（已注册）。

import { useCallback, useEffect, useState } from "react";
import { Check, ChevronRight, Copy, CreditCard, Loader2, Save, Zap } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
    getPaymentConfigDetailsApi,
    savePaymentConfigApi,
    testPaymentConfigApi,
    togglePaymentProviderApi,
} from "@/lib/api-payment";
import { cn } from "@/lib/utils";
import type { PaymentConfigDetails, PaymentFormValues, PaymentProvider, PaymentProviderSlug } from "@/types/payment";

/** 单个配置字段的声明 */
interface PaymentFieldDef {
    name: string;
    label: string;
    required?: boolean;
    /** 密钥类：默认密文显示，可切换 */
    secret?: boolean;
    /** 长文本（私钥 / 证书）用多行 */
    rows?: number;
    placeholder?: string;
    hint?: string;
}

/** 一种支付方式的声明 */
interface ProviderDef {
    /** 同源路由与远端保存接口用的路径段（小写） */
    slug: PaymentProviderSlug;
    /** 远端 toggle / test 用的大写枚举 */
    provider: PaymentProvider;
    name: string;
    desc: string;
    fields: PaymentFieldDef[];
}

const PROVIDERS: ProviderDef[] = [
    {
        slug: "alipay",
        provider: "ALIPAY",
        name: "支付宝",
        desc: "电脑网站 / 手机网站支付（当面付亦可），需要应用私钥与支付宝公钥。",
        fields: [
            { name: "app_id", label: "App ID", required: true, placeholder: "2021xxxxxxxxxxxx" },
            {
                name: "app_private_key",
                label: "应用私钥",
                required: true,
                secret: true,
                rows: 3,
                placeholder: "MIIEvQIBADANBgkq...",
                hint: "支付宝开放平台生成的 RSA2 私钥（PKCS#8）",
            },
            {
                name: "alipay_public_key",
                label: "支付宝公钥",
                required: true,
                secret: true,
                rows: 3,
                placeholder: "MIIBIjANBgkq...",
                hint: "是「支付宝公钥」，不是自己生成的应用公钥",
            },
        ],
    },
    {
        slug: "wechat",
        provider: "WECHAT",
        name: "微信支付",
        desc: "微信支付 V3（Native / JSAPI），需要商户号、证书序列号与 APIv3 密钥。",
        fields: [
            { name: "app_id", label: "AppID", required: true, placeholder: "wx1234567890abcdef" },
            { name: "mch_id", label: "商户号", required: true, placeholder: "16xxxxxxxx" },
            { name: "mch_serial_no", label: "证书序列号", required: true, hint: "商户 API 证书的序列号" },
            {
                name: "api_v3_key",
                label: "APIv3 密钥",
                required: true,
                secret: true,
                hint: "商户平台设置的 32 位 APIv3 密钥",
            },
            {
                name: "private_key_data",
                label: "商户私钥",
                required: true,
                secret: true,
                rows: 3,
                placeholder: "-----BEGIN PRIVATE KEY-----",
                hint: "apiclient_key.pem 的内容",
            },
        ],
    },
    {
        slug: "epay",
        provider: "EPAY",
        name: "易支付",
        desc: "彩虹易支付等兼容协议的中转支付。",
        fields: [
            { name: "mch_id", label: "商户 ID", required: true },
            { name: "key", label: "商户密钥", required: true, secret: true },
            { name: "gateway", label: "接口地址", required: true, placeholder: "https://pay.example.com/" },
            { name: "return_url", label: "同步跳转地址", placeholder: "留空用站点默认" },
        ],
    },
    {
        slug: "hupijiao",
        provider: "HUPIJIAO",
        name: "虎皮椒 V3",
        desc: "虎皮椒（xunhupay）个人 / 小微商户通道。",
        fields: [
            { name: "app_id", label: "应用 ID", required: true },
            { name: "app_secret", label: "应用密钥", required: true, secret: true },
            { name: "gateway", label: "网关地址", placeholder: "https://api.xunhupay.com" },
            { name: "return_url", label: "同步跳转地址", placeholder: "留空用站点默认" },
        ],
    },
];

/** 空表单（所有字段都给空串，避免受控/非受控切换告警） */
function emptyForm(def: ProviderDef): PaymentFormValues {
    const form: PaymentFormValues = {};
    for (const field of def.fields) form[field.name] = "";
    return form;
}

type Forms = Record<string, PaymentFormValues>;
type Busy = Record<string, boolean>;

/**
 * 从配置详情里取某个方式的表单初始值。
 * 官方前端直接拿 details 里的值回填（后端读接口会带出已存内容）；
 * has_* 为真但值为空的情况（被掩码/未下发）留空，保存时该键不提交 —— 表示「保持原值」。
 */
function formFromDetails(def: ProviderDef, details: PaymentConfigDetails | null): PaymentFormValues {
    const form = emptyForm(def);
    const remote = (details?.[def.slug] ?? null) as Record<string, unknown> | null;
    if (!remote) return form;
    for (const field of def.fields) {
        const value = remote[field.name];
        if (typeof value === "string" && value.trim() !== "") form[field.name] = value;
    }
    return form;
}

/** 「已配置」判据：后端 configured 标志优先，其次 required 字段是否齐全 */
function isConfigured(def: ProviderDef, details: PaymentConfigDetails | null): boolean {
    const remote = (details?.[def.slug] ?? null) as Record<string, unknown> | null;
    if (!remote) return false;
    if (typeof remote.configured === "boolean") return remote.configured;
    return def.fields.every((field) => !field.required || String(remote[field.name] ?? "").trim() !== "");
}

export function PaymentSettingsPanel() {
    const [details, setDetails] = useState<PaymentConfigDetails | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [forms, setForms] = useState<Forms>({});
    const [expanded, setExpanded] = useState<string | null>(PROVIDERS[0].slug);
    const [busy, setBusy] = useState<Busy>({});
    /** 密钥显隐：key = `${slug}.${field}` */
    const [revealed, setRevealed] = useState<Record<string, boolean>>({});
    /** 测试连接结果：key = slug */
    const [tested, setTested] = useState<Record<string, { ok: boolean; message: string }>>({});

    const load = useCallback(async () => {
        setLoading(true);
        setLoadError(null);
        try {
            const data = await getPaymentConfigDetailsApi();
            setDetails(data);
            const next: Forms = {};
            for (const def of PROVIDERS) next[def.slug] = formFromDetails(def, data);
            setForms(next);
        } catch (error) {
            setLoadError(error instanceof Error ? error.message : "读取支付配置失败");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        // 首帧不要同步 setState（react-compiler 的 set-state-in-effect 规则）：
        // 先让出一帧再拉配置，避免 effect 内同步触发一次级联渲染。
        let cancelled = false;
        void (async () => {
            await Promise.resolve();
            if (cancelled) return;
            await load();
        })();
        return () => {
            cancelled = true;
        };
    }, [load]);

    const setField = (slug: string, name: string, value: string) => {
        setForms((prev) => ({ ...prev, [slug]: { ...(prev[slug] ?? {}), [name]: value } }));
    };

    const handleSave = async (def: ProviderDef) => {
        const form = forms[def.slug] ?? emptyForm(def);
        const missing = def.fields.filter((field) => field.required && !String(form[field.name] ?? "").trim());
        if (missing.length > 0) {
            toast.warning(`请填写：${missing.map((field) => field.label).join("、")}`);
            return;
        }

        // 空着的密钥类字段不提交：详情接口可能只回掩码/不回值，
        // 传空串会把已存的私钥清掉，留空即「保持原值」更安全。
        const payload: PaymentFormValues = {};
        for (const field of def.fields) {
            const value = String(form[field.name] ?? "").trim();
            if (value === "" && field.secret) continue;
            payload[field.name] = value;
        }

        setBusy((prev) => ({ ...prev, [`save:${def.slug}`]: true }));
        try {
            await savePaymentConfigApi(def.slug, payload);
            toast.success(`${def.name}配置已保存`);
            setTested((prev) => {
                const next = { ...prev };
                delete next[def.slug];
                return next;
            });
            await load();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "保存失败");
        } finally {
            setBusy((prev) => ({ ...prev, [`save:${def.slug}`]: false }));
        }
    };

    const handleToggle = async (def: ProviderDef, enabled: boolean) => {
        setBusy((prev) => ({ ...prev, [`toggle:${def.slug}`]: true }));
        try {
            await togglePaymentProviderApi(def.slug, enabled);
            setDetails((prev) => {
                if (!prev) return prev;
                const current = prev[def.slug] as unknown as Record<string, unknown>;
                // 四种详情结构不同，统一按 Record 拼再收回来（只改 enabled）
                return { ...prev, [def.slug]: { ...current, enabled } } as PaymentConfigDetails;
            });
            toast.success(`${def.name}已${enabled ? "启用" : "停用"}`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "切换失败");
        } finally {
            setBusy((prev) => ({ ...prev, [`toggle:${def.slug}`]: false }));
        }
    };

    const handleTest = async (def: ProviderDef) => {
        setBusy((prev) => ({ ...prev, [`test:${def.slug}`]: true }));
        try {
            const message = await testPaymentConfigApi(def.slug);
            setTested((prev) => ({ ...prev, [def.slug]: { ok: true, message: message || "连接正常" } }));
            toast.success(`${def.name}连接测试通过`, { description: message || undefined });
        } catch (error) {
            const message = error instanceof Error ? error.message : "测试失败";
            setTested((prev) => ({ ...prev, [def.slug]: { ok: false, message } }));
            toast.error(`${def.name}连接测试失败`, { description: message });
        } finally {
            setBusy((prev) => ({ ...prev, [`test:${def.slug}`]: false }));
        }
    };

    const copyText = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            toast.success("已复制到剪贴板");
        } catch {
            toast.error("复制失败，请手动选中复制");
        }
    };

    if (loading) {
        return (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                正在读取支付配置…
            </div>
        );
    }

    if (loadError) {
        return (
            <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
                <p className="font-medium text-destructive">读取支付配置失败</p>
                <p className="mt-1 text-xs text-muted-foreground">{loadError}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                    支付配置属于 PRO 模块。若后端是社区版，这组接口不存在，本面板自然读不到东西。
                </p>
                <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => void load()}>
                    重试
                </Button>
            </div>
        );
    }

    const available = details?.available_providers ?? null;

    return (
        <div className="space-y-3">
            {PROVIDERS.map((def) => {
                const configured = isConfigured(def, details);
                const enabled = Boolean((details?.[def.slug] as { enabled?: boolean } | undefined)?.enabled);
                const notifyUrl = String((details?.[def.slug] as { notify_url?: string } | undefined)?.notify_url ?? "");
                const supported = available === null || available.length === 0 || available.includes(def.provider);
                const open = expanded === def.slug;
                const result = tested[def.slug];
                const form = forms[def.slug] ?? emptyForm(def);

                return (
                    <section
                        key={def.slug}
                        className={cn(
                            "rounded-xl border bg-card",
                            open ? "border-border/80" : "border-border/50",
                            !supported && "opacity-60"
                        )}
                    >
                        <header className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                            <button
                                type="button"
                                onClick={() => setExpanded(open ? null : def.slug)}
                                aria-expanded={open}
                                className="flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-0.5 text-left transition-colors hover:bg-muted/50"
                            >
                                <ChevronRight
                                    className={cn(
                                        "size-3.5 shrink-0 text-muted-foreground transition-transform",
                                        open && "rotate-90"
                                    )}
                                />
                                <CreditCard className="size-4 shrink-0 text-muted-foreground" />
                                <span className="truncate text-sm font-semibold">{def.name}</span>
                                <span
                                    className={cn(
                                        "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
                                        configured
                                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                            : "bg-muted text-muted-foreground"
                                    )}
                                >
                                    {configured ? "已配置" : "未配置"}
                                </span>
                                {!supported && (
                                    <span className="shrink-0 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                                        当前版本不支持
                                    </span>
                                )}
                            </button>

                            <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                                <Checkbox
                                    checked={enabled}
                                    disabled={!supported || !configured || Boolean(busy[`toggle:${def.slug}`])}
                                    onCheckedChange={(checked) => void handleToggle(def, checked === true)}
                                    aria-label={`启用${def.name}`}
                                />
                                启用
                            </label>
                        </header>

                        {open && (
                            <div className="space-y-4 border-t border-border/40 px-4 py-4">
                                <p className="text-xs text-muted-foreground">{def.desc}</p>

                                {notifyUrl && (
                                    <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
                                        <div className="min-w-0 flex-1">
                                            <p className="text-[11px] font-medium text-muted-foreground">
                                                回调通知地址（填到支付平台后台）
                                            </p>
                                            <p className="truncate font-mono text-[11px]" title={notifyUrl}>
                                                {notifyUrl}
                                            </p>
                                        </div>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon-lg"
                                            aria-label="复制回调地址"
                                            title="复制"
                                            onClick={() => void copyText(notifyUrl)}
                                        >
                                            <Copy className="size-4" />
                                        </Button>
                                    </div>
                                )}

                                <div className="grid grid-cols-1 gap-x-5 gap-y-4 md:grid-cols-2">
                                    {def.fields.map((field) => {
                                        const value = String(form[field.name] ?? "");
                                        const revealKey = `${def.slug}.${field.name}`;
                                        const revealedValue = Boolean(revealed[revealKey]);
                                        const wide = Boolean(field.rows);
                                        return (
                                            <label key={field.name} className={cn("block", wide && "md:col-span-2")}>
                                                <span className="mb-1.5 flex items-center gap-x-1.5 text-xs font-medium text-muted-foreground">
                                                    <span className="shrink-0 whitespace-nowrap">{field.label}</span>
                                                    {field.required && <span className="text-destructive">*</span>}
                                                    {field.hint && (
                                                        <span
                                                            className="min-w-0 flex-1 truncate font-normal text-muted-foreground/70"
                                                            title={field.hint}
                                                        >
                                                            · {field.hint}
                                                        </span>
                                                    )}
                                                    {field.secret && (
                                                        <button
                                                            type="button"
                                                            className="shrink-0 rounded px-1 text-[11px] text-primary hover:underline"
                                                            onClick={() => {
                                                                setRevealed((prev) => ({
                                                                    ...prev,
                                                                    [revealKey]: !prev[revealKey],
                                                                }));
                                                            }}
                                                        >
                                                            {revealedValue ? "隐藏" : "显示"}
                                                        </button>
                                                    )}
                                                </span>
                                                {wide ? (
                                                    <textarea
                                                        value={value}
                                                        onChange={(e) => setField(def.slug, field.name, e.target.value)}
                                                        rows={field.rows}
                                                        spellCheck={false}
                                                        placeholder={field.placeholder}
                                                        className="w-full rounded-lg border border-input bg-transparent px-3 py-2 font-mono text-xs leading-relaxed outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                                                    />
                                                ) : (
                                                    <Input
                                                        type={field.secret && !revealedValue ? "password" : "text"}
                                                        autoComplete="off"
                                                        value={value}
                                                        onChange={(e) => setField(def.slug, field.name, e.target.value)}
                                                        placeholder={field.placeholder}
                                                        className="h-9 text-sm"
                                                    />
                                                )}
                                            </label>
                                        );
                                    })}
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                    <Button
                                        type="button"
                                        size="sm"
                                        disabled={Boolean(busy[`save:${def.slug}`])}
                                        onClick={() => void handleSave(def)}
                                    >
                                        {busy[`save:${def.slug}`] ? (
                                            <Loader2 className="size-4 animate-spin" />
                                        ) : (
                                            <Save className="size-4" />
                                        )}
                                        保存配置
                                    </Button>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        disabled={!configured || Boolean(busy[`test:${def.slug}`])}
                                        onClick={() => void handleTest(def)}
                                    >
                                        {busy[`test:${def.slug}`] ? (
                                            <Loader2 className="size-4 animate-spin" />
                                        ) : (
                                            <Zap className="size-4" />
                                        )}
                                        测试连接
                                    </Button>
                                    {result && (
                                        <span
                                            className={cn(
                                                "flex items-center gap-1 text-[11px]",
                                                result.ok ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
                                            )}
                                        >
                                            {result.ok ? <Check className="size-3.5" /> : null}
                                            {result.message}
                                        </span>
                                    )}
                                </div>
                            </div>
                        )}
                    </section>
                );
            })}
        </div>
    );
}
