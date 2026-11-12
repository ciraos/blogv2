"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Loader2, Save, Server, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    type AdminStoragePolicy,
    fieldGroupsOf,
    formValuesToPayload,
    getAdminStoragePolicyApi,
    getOneDriveAuthUrlApi,
    hasStoredSecret,
    policyToFormValues,
    SECRET_MASK,
    type StorageFieldSpec,
    type StoragePolicyFormValues,
    updateAdminStoragePolicyApi,
} from "@/lib/api-storage-policies-write";
import { FLAG_OPTIONS, TYPE_OPTIONS } from "@/types/storage-policy";

/**
 * 存储策略编辑页（/admin/storage/[id]）。
 *
 * 远端契约：
 *   GET /api/admin/storage-policies/[id]  → 远端 GET /api/policies/{id}
 *   PUT /api/admin/storage-policies/[id]  → 远端 PUT /api/policies/{id}
 *   GET /api/admin/storage-policies/onedrive/connect/[id] → 远端 GET /api/policies/connect/onedrive/{id}
 *
 * 字段分组 / 名称 / 占位符 / 说明全部对齐官方前端
 * （scripts/theme/theme-anheyu-next-main/src/components/admin/storage/*Form.tsx 与
 *   app/admin/storage/[id]/page.tsx:210-339），定义集中在
 * src/lib/api-storage-policies-write.ts 的 STORAGE_POLICY_FIELD_GROUPS。
 *
 * ⚠️ 保存是**整体覆盖**：后端 UpdatePolicyRequest 的 name/type 是 binding:"required"，
 *    且 PUT 会用请求体覆盖全部字段（volume/storage_policy_service.go:408-592），
 *    所以这里始终提交完整对象；密钥未改动时提交空串，由后端
 *    preserveMaskedStoragePolicySecrets（同文件 594-604）还原原值。
 * ⚠️ 写操作本轮只实现不实测（改存储策略会影响上传落盘与已有文件寻址）。
 */

/** 单字段渲染：top 字段与 settings 字段共用 */
function FieldControl({
    field,
    value,
    disabled,
    onChange,
}: {
    field: StorageFieldSpec;
    value: string | number | boolean | undefined;
    disabled: boolean;
    onChange: (value: string | number | boolean) => void;
}) {
    if (field.kind === "switch") {
        return (
            <label className="flex items-start gap-2 rounded-lg border bg-muted/30 px-3 py-2">
                <input
                    type="checkbox"
                    className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]"
                    checked={value === true}
                    disabled={disabled}
                    onChange={(e) => onChange(e.target.checked)}
                />
                <span className="min-w-0">
                    <span className="block text-sm">{field.label}</span>
                    {field.description && (
                        <span className="mt-0.5 block text-xs text-muted-foreground/80">{field.description}</span>
                    )}
                </span>
            </label>
        );
    }

    if (field.kind === "select") {
        const options = field.options ?? [];
        const current = typeof value === "string" && value ? value : options[0]?.value ?? "";
        return (
            <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">{field.label}</Label>
                <Select value={current} onValueChange={onChange} disabled={disabled}>
                    <SelectTrigger className="h-8 w-full text-sm">
                        <SelectValue placeholder={field.placeholder ?? "请选择"} />
                    </SelectTrigger>
                    <SelectContent>
                        {options.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                                {o.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                {field.description && (
                    <p className="text-xs text-muted-foreground/80">{field.description}</p>
                )}
            </div>
        );
    }

    // text / password / url
    return (
        <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">{field.label}</Label>
            <Input
                type={field.kind === "url" ? "text" : field.kind}
                value={value === undefined || value === null ? "" : String(value)}
                placeholder={field.placeholder}
                disabled={disabled}
                onChange={(e) => onChange(e.target.value)}
                className="h-8 text-sm"
                autoComplete={field.kind === "password" ? "new-password" : "off"}
            />
            {field.description && <p className="text-xs text-muted-foreground/80">{field.description}</p>}
        </div>
    );
}

/** 一个分组（带官方表单里那条「小标题 + 下边框」的视觉节奏） */
function FieldGroupBlock({
    title,
    source,
    fields,
    values,
    hasStored,
    disabled,
    onTop,
    onSettings,
    onSecret,
}: {
    title: string;
    source: "top" | "settings";
    fields: StorageFieldSpec[];
    values: StoragePolicyFormValues;
    hasStored: boolean;
    disabled: boolean;
    onTop: (key: string, value: string | number | boolean) => void;
    onSettings: (key: string, value: string | number | boolean) => void;
    onSecret: (key: "access_key" | "secret_key") => void;
}) {
    return (
        <section className="space-y-3">
            <h3 className="border-b border-border/60 pb-2 text-[13px] font-medium text-foreground/80">{title}</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {fields.map((field) => {
                    const fieldSource = field.source ?? source;
                    const isTop = fieldSource === "top";
                    const value = isTop
                        ? (values[field.key as keyof StoragePolicyFormValues] as string | number | boolean | undefined)
                        : (values.settings[field.key] as string | number | boolean | undefined);
                    const isSecretField = isTop && (field.key === "access_key" || field.key === "secret_key");

                    return (
                        <div key={`${fieldSource}-${field.key}`} className={field.wide || field.kind === "switch" ? "sm:col-span-2" : ""}>
                            <FieldControl
                                field={field}
                                value={value}
                                disabled={disabled}
                                onChange={(next) => {
                                    if (isSecretField) {
                                        onSecret(field.key as "access_key" | "secret_key");
                                    }
                                    if (isTop) onTop(field.key, next);
                                    else onSettings(field.key, next);
                                }}
                            />
                            {isSecretField && hasStored && (
                                <p className="mt-1 text-xs text-muted-foreground/80">
                                    服务端返回的是掩码 {SECRET_MASK}，不回显真实值；留空表示保持原有密钥不变。
                                </p>
                            )}
                        </div>
                    );
                })}
            </div>
        </section>
    );
}

/** 主组件：加载 → 表单；加载失败给可重试的错误态，绝不白屏 */
export function StoragePolicyEditPage({ policyId }: { policyId: string }) {
    const router = useRouter();

    const [policy, setPolicy] = useState<AdminStoragePolicy | null>(null);
    const [values, setValues] = useState<StoragePolicyFormValues | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [authorizing, setAuthorizing] = useState(false);

    /** 重新拉取（首次进入 / 失败重试共用） */
    const load = useCallback(() => {
        let cancelled = false;
        const timer = setTimeout(() => setLoading(true), 0);
        getAdminStoragePolicyApi(policyId)
            .then((data) => {
                if (cancelled) return;
                setPolicy(data);
                setValues(policyToFormValues(data));
                setError(null);
            })
            .catch((e) => {
                if (cancelled) return;
                const msg = e instanceof Error ? e.message : "存储策略详情加载失败";
                setPolicy(null);
                setValues(null);
                setError(msg);
                toast.error(msg);
            })
            .finally(() => {
                if (!cancelled) {
                    clearTimeout(timer);
                    setLoading(false);
                }
            });
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [policyId]);

    useEffect(() => load(), [load]);

    const groups = useMemo(() => fieldGroupsOf(values?.type ?? policy?.type ?? "local"), [values?.type, policy?.type]);
    const hasStored = hasStoredSecret(policy ?? {});
    const isOneDrive = (values?.type ?? "") === "onedrive";
    const oneDriveReady = hasStored;

    const patchTop = useCallback((key: string, value: string | number | boolean) => {
        setValues((prev) => (prev ? { ...prev, [key]: value } : prev));
    }, []);

    const patchSettings = useCallback((key: string, value: string | number | boolean) => {
        setValues((prev) => (prev ? { ...prev, settings: { ...prev.settings, [key]: value } } : prev));
    }, []);

    /** 用户真的改过密钥才提交该字段（否则交空串让后端保留原值） */
    const markSecretDirty = useCallback((key: "access_key" | "secret_key") => {
        setValues((prev) =>
            prev ? { ...prev, [`${key}_dirty`]: true } : prev
        );
    }, []);

    const submit = async () => {
        if (!values) return;
        if (!values.name.trim()) {
            toast.error("请填写策略名称");
            return;
        }
        if (!values.virtual_path.trim() || !values.virtual_path.trim().startsWith("/")) {
            toast.error("应用内挂载路径不能为空且必须以 / 开头");
            return;
        }
        setSaving(true);
        try {
            await updateAdminStoragePolicyApi(policyId, formValuesToPayload(values));
            toast.success("保存成功");
            setConfirmOpen(false);
            router.push("/admin/storage");
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "保存存储策略失败");
        } finally {
            setSaving(false);
        }
    };

    /**
     * OneDrive 授权：GET 拿授权链接后整窗跳转。
     * 官方前端也是这么做的（官方 storage/[id]/page.tsx:85-97：取 data.url → window.location.href）。
     * 授权完成后微软会跳到后端登记的回调地址，由后端自己收尾（社区版 handler 的 ConnectOneDrive
     * 只负责生成链接，因此回调落在后端而非本站前端）。
     */
    const authorizeOneDrive = async () => {
        setAuthorizing(true);
        try {
            const data = await getOneDriveAuthUrlApi(policyId);
            if (!data?.url) {
                toast.error("后端没有返回授权链接");
                return;
            }
            toast.info("正在跳转到微软授权页面…");
            window.location.href = data.url;
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "获取 OneDrive 授权链接失败");
        } finally {
            setAuthorizing(false);
        }
    };

    if (loading) {
        return (
            <div className="admin-page">
                <div className="admin-card">
                    <div className="admin-scroll flex min-h-64 flex-col items-center justify-center gap-2 p-12 text-sm text-muted-foreground">
                        <Loader2 className="size-5 animate-spin" />
                        正在加载存储策略…
                    </div>
                </div>
            </div>
        );
    }

    if (error || !values) {
        return (
            <div className="admin-page">
                <div className="admin-card">
                    <div className="admin-scroll flex min-h-64 flex-col items-center justify-center gap-2 p-12 text-center">
                        <span className="flex size-12 items-center justify-center rounded-full border bg-destructive/10">
                            <Server className="size-5 text-destructive" />
                        </span>
                        <p className="text-sm font-medium text-destructive">存储策略加载失败</p>
                        <p className="max-w-md text-xs text-muted-foreground">{error}</p>
                        <div className="mt-1 flex gap-2">
                            <Button variant="outline" size="sm" className="h-8 rounded-lg text-xs" onClick={() => load()}>
                                重试
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 rounded-lg text-xs"
                                onClick={() => router.push("/admin/storage")}
                            >
                                返回列表
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="admin-page">
            <div className="admin-page-head">
                <div>
                    <h2 className="text-xl font-semibold tracking-tight">编辑存储策略 · {policy?.name ?? policyId}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                        修改存储策略可能影响已有文件的访问地址与上传落盘位置，保存前请确认
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => router.push("/admin/storage")}
                        disabled={saving}
                    >
                        <ArrowLeft className="size-3.5" />
                        返回列表
                    </Button>
                    <Button size="sm" className="h-8 text-xs" onClick={() => setConfirmOpen(true)} disabled={saving}>
                        {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                        保存
                    </Button>
                </div>
            </div>

            <div className="admin-card">
                <div className="admin-scroll">
                    <div className="mx-auto w-full max-w-3xl space-y-8 p-5">
                        {/* OneDrive 授权状态（官方编辑页同样把这块放在最上面） */}
                        {isOneDrive && (
                            <section
                                className={`rounded-lg border p-4 ${
                                    oneDriveReady
                                        ? "border-emerald-500/30 bg-emerald-500/5"
                                        : "border-amber-500/30 bg-amber-500/5"
                                }`}
                            >
                                <h3 className="flex items-center gap-2 text-sm font-semibold">
                                    {oneDriveReady ? (
                                        <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
                                    ) : (
                                        <TriangleAlert className="size-4 text-amber-600 dark:text-amber-400" />
                                    )}
                                    账号授权
                                </h3>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    {oneDriveReady
                                        ? "服务端已存有该策略的凭据（返回值为掩码）。若怀疑授权已失效，可重新授权覆盖。"
                                        : "当前策略尚未授权。请先填好 Graph 端点、应用 ID、客户端密码并保存，再点击下方按钮授权。"}
                                </p>
                                <Button
                                    size="sm"
                                    className="mt-3 h-8 text-xs"
                                    onClick={authorizeOneDrive}
                                    disabled={authorizing || !oneDriveReady}
                                    title={oneDriveReady ? "跳转微软授权页" : "请先保存 Graph 端点 / 应用 ID / 客户端密码"}
                                >
                                    {authorizing && <Loader2 className="size-3.5 animate-spin" />}
                                    {oneDriveReady ? "重新授权" : "立即授权"}
                                </Button>
                            </section>
                        )}

                        {/* 基本信息（官方：策略名称 / 策略标志 / 存储类型） */}
                        <section className="space-y-3">
                            <h3 className="border-b border-border/60 pb-2 text-[13px] font-medium text-foreground/80">基本信息</h3>
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-medium text-muted-foreground">策略名称</Label>
                                    <Input
                                        value={values.name}
                                        onChange={(e) => patchTop("name", e.target.value)}
                                        placeholder="请输入策略名称"
                                        className="h-8 text-sm"
                                        disabled={saving}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-medium text-muted-foreground">策略标志（默认用途）</Label>
                                    <Select
                                        value={values.flag || "none"}
                                        onValueChange={(v) => patchTop("flag", v === "none" ? "" : v)}
                                        disabled={saving}
                                    >
                                        <SelectTrigger className="h-8 w-full text-sm">
                                            <SelectValue placeholder="请选择策略标志" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">无（普通策略）</SelectItem>
                                            {FLAG_OPTIONS.map((o) => (
                                                <SelectItem key={o.value} value={o.value}>
                                                    {o.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <p className="text-xs text-muted-foreground/80">
                                        设置后该策略成为该用途的默认存储位置，标志全局唯一，原持有者会被自动清除
                                    </p>
                                </div>
                                <div className="space-y-1.5 sm:col-span-2">
                                    <Label className="text-xs font-medium text-muted-foreground">存储类型</Label>
                                    <Input value={TYPE_OPTIONS.find((t) => t.value === values.type)?.label ?? values.type} readOnly disabled className="h-8 text-sm" />
                                    <p className="text-xs text-muted-foreground/80">
                                        类型由后端在创建时确定，创建后不可更改；要换类型请新建策略
                                    </p>
                                </div>
                            </div>
                        </section>

                        {/* 各存储类型自己的字段分组 */}
                        {groups.map((group) => (
                            <FieldGroupBlock
                                key={`${group.source}-${group.title}`}
                                title={group.title}
                                source={group.source}
                                fields={group.fields}
                                values={values}
                                hasStored={hasStored}
                                disabled={saving}
                                onTop={patchTop}
                                onSettings={patchSettings}
                                onSecret={markSecretDirty}
                            />
                        ))}

                        {/* 存储与上传（官方：文件大小限制 / 上传分片大小 / OSS 图片处理样式） */}
                        <section className="space-y-3">
                            <h3 className="border-b border-border/60 pb-2 text-[13px] font-medium text-foreground/80">存储与上传</h3>
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-medium text-muted-foreground">文件大小限制（MB）</Label>
                                    <Input
                                        type="number"
                                        min={0}
                                        step={1}
                                        value={String(Math.round((values.max_size || 0) / 1024 / 1024))}
                                        onChange={(e) =>
                                            patchTop("max_size", Math.max(0, Math.round(Number(e.target.value) || 0)) * 1024 * 1024)
                                        }
                                        className="h-8 text-sm tabular-nums"
                                        disabled={saving}
                                    />
                                    <p className="text-xs text-muted-foreground/80">
                                        单个文件的最大大小，0 表示不限制（提交时换算为字节 max_size）
                                    </p>
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-medium text-muted-foreground">上传分片大小（MB）</Label>
                                    <Input
                                        type="number"
                                        min={0}
                                        step={1}
                                        value={String(
                                            Math.round((Number(values.settings.chunk_size ?? 0) || 0) / 1024 / 1024)
                                        )}
                                        onChange={(e) =>
                                            patchSettings(
                                                "chunk_size",
                                                Math.max(0, Math.round(Number(e.target.value) || 0)) * 1024 * 1024
                                            )
                                        }
                                        className="h-8 text-sm tabular-nums"
                                        disabled={saving}
                                    />
                                    <p className="text-xs text-muted-foreground/80">
                                        分片上传时每个分片的大小，0 表示使用后端默认值（settings.chunk_size）
                                    </p>
                                </div>
                            </div>
                        </section>
                    </div>
                </div>
            </div>

            {/* 保存二次确认：明确提示会影响已有文件访问 */}
            {confirmOpen && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
                    onMouseDown={saving ? undefined : () => setConfirmOpen(false)}
                    role="dialog"
                    aria-modal="true"
                    aria-label="确认保存存储策略"
                >
                    <div
                        className="w-full max-w-xl rounded-xl border bg-card p-5 shadow-xl"
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        <h3 className="text-base font-semibold">保存存储策略</h3>
                        <div className="mt-3 flex items-start gap-2 text-sm text-muted-foreground">
                            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-500" />
                            <div className="space-y-1">
                                <p>保存会整体覆盖该策略的参数，并可能影响已有文件的访问地址与上传落盘位置。</p>
                                <p>密钥留空表示保持原值不变；若修改了挂载路径，后端还要求新挂载点目录为空。</p>
                            </div>
                        </div>
                        <div className="mt-4 flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={saving}>
                                取消
                            </Button>
                            <Button onClick={submit} disabled={saving}>
                                {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                                确认保存
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
