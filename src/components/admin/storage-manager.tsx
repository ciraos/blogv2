"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Cloud, HardDrive, Loader2, Pencil, Plus, RefreshCw, Search, Server, Star, Trash2, TriangleAlert, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PaginationControls } from "@/components/pagination-controls";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { getAdminStoragePoliciesApi } from "@/lib/api";
import {
    type AdminStoragePolicy,
    createAdminStoragePolicyApi,
    deleteAdminStoragePolicyApi,
    emptyFormValues,
    formValuesToPayload,
    formValuesWithFlag,
    getAdminStoragePolicyApi,
    POLICY_FLAG_VALUES,
    policyToFormValues,
    type StoragePolicyFlagValue,
    type StoragePolicyFormValues,
    updateAdminStoragePolicyApi,
} from "@/lib/api-storage-policies-write";
import { ACTION_TONE } from "@/lib/action-tones";
import { FLAG_OPTIONS, TYPE_OPTIONS } from "@/types/storage-policy";
import { useRouter } from "next/navigation";

/**
 * 存储策略页 —— 读 + 写（增 / 改 / 删 / 设为默认 / 刷新）本轮全部接真接口。
 *
 * 远端契约（社区版，路径与字段均以源码为准，详见 src/lib/api-storage-policies-write.ts 顶部注释）：
 *  - GET    /api/policies                       列表（响应 { list, total }，无分页字段）
 *  - POST   /api/policies                       新建
 *  - GET    /api/policies/{id}                  详情（编辑页用）
 *  - PUT    /api/policies/{id}                  更新（整体覆盖；「设为默认」也是改这里的 flag）
 *  - DELETE /api/policies/{id}                  删除
 *  - GET    /api/policies/connect/onedrive/{id} 取 OneDrive 授权链接
 * 同源代理 /api/admin/storage-policies/**（见 src/app/api/admin/storage-policies/）。
 *
 * ⚠️ 后端没有 is_default 字段：「默认策略」就是 Flag 字段（article_image / comment_image / user_avatar），
 *    由 volume/storage_policy_service.go:442-456 保证同一 Flag 全局唯一（设置新持有者时清掉旧的）。
 *    因此「设为默认」= PUT 该策略并把 flag 改成所选用途。
 * ⚠️ 后端禁止删除 id=1、flag 非空、virtual_path 为 "/" 的策略（service:617-630），
 *    前端据此禁用删除按钮并给出文案，避免点了才报错。
 * ⚠️ 写操作**本轮只实现不实测**（改存储策略会影响上传落盘与已有文件寻址）。
 *
 * 由于列表接口没有分页参数，分页与筛选全部在本地完成（拿全量 list 后 slice / filter）。
 * 外壳沿用后台列表页统一外壳：admin-card 内只有 admin-scroll 一个直系滚动子元素。
 */

const PAGE_SIZE = 10;

const typeLabel = (type?: string) => TYPE_OPTIONS.find((t) => t.value === type)?.label ?? type ?? "—";

const flagLabel = (flag?: string) => FLAG_OPTIONS.find((f) => f.value === flag)?.label ?? "—";

/** 类型徽章配色：本机 = 中性，云厂商 = 主题色系 */
function typeBadgeCls(type?: string): string {
    if (type === "local") return "bg-muted text-muted-foreground";
    return "bg-primary/10 text-primary dark:bg-primary/15";
}

/** 字节数 → MB / GB（max_size 后端按字节存） */
function formatMaxSize(bytes?: number): string {
    if (!bytes || bytes <= 0) return "—";
    const mb = bytes / 1024 / 1024;
    if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
    return `${mb >= 100 ? Math.round(mb) : mb.toFixed(1)} MB`;
}

/** ISO → YYYY-MM-DD HH:MM（本地时区；数据由接口返回，不涉及水合一致性） */
function formatDateTime(iso?: string): string {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 访问域名：优先 virtual_path，其次 settings.cdn_domain */
function domainOf(item: AdminStoragePolicy): string {
    const cdn = typeof item.settings?.cdn_domain === "string" ? item.settings.cdn_domain : "";
    return item.virtual_path || cdn || item.base_path || "—";
}

/**
 * 该策略是否属于「受保护、不可删除」：
 *  - 有 flag → 后端视为内置系统策略，删除会被拒（service:623-625）；
 *  - virtual_path 为 "/" → 后端视为默认根策略，删除会被拒（service:628-630）；
 *  - id 为 "1" → 后端硬编码禁止删除默认策略（service:618-620），这是内部自增 ID，
 *    公共 ID 里看不到，这里只能对明显的 "1" 做一次兜底判断。
 */
function deleteBlockReason(item: AdminStoragePolicy): string | null {
    if (item.flag) return "内置默认策略不可删除";
    if (item.virtual_path === "/") return "默认根存储策略不可删除";
    if (String(item.id) === "1") return "默认策略不可删除";
    return null;
}

/** 类型 → 该类型在「新建」里必须填的一级字段（对齐官方表单里的必填项） */
const PROVIDER_HINTS: Record<string, string> = {
    local: "挂载路径只能一级，例如 /local；存储目录由后端按挂载路径归一化到 data/storage/ 下",
    onedrive: "需要 Microsoft Graph 端点、应用 ID、客户端密码；创建后到编辑页完成 OAuth 授权",
    tencent_cos: "需要存储桶名称、访问域名、SecretId、SecretKey",
    aliyun_oss: "需要存储桶名称、访问域名、AccessKey ID、AccessKey Secret",
    aws_s3: "需要存储桶名称、Access Key ID、Secret Access Key；Endpoint 可留空走 AWS 默认",
    qiniu_kodo: "需要存储空间、存储区域、AccessKey、SecretKey，以及七牛访问域名（后端必填）",
    upyun: "需要 REST API 端点、服务名、操作员、操作员密码",
};

// ===================================
//          通用弹窗外壳
// ===================================

/**
 * 弹窗外壳：项目里没有 Dialog 组件（components.json 只装了 Sheet），
 * 沿用 plugins-manager / memberships-manager 的手写模态框写法，配色走主题令牌。
 */
function Modal({
    title,
    description,
    onClose,
    children,
    wide,
    closeDisabled,
}: {
    title: string;
    description?: string;
    onClose: () => void;
    children: React.ReactNode;
    wide?: boolean;
    closeDisabled?: boolean;
}) {
    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onMouseDown={closeDisabled ? undefined : onClose}
            role="dialog"
            aria-modal="true"
            aria-label={title}
        >
            <div
                className={`flex max-h-[86vh] w-full flex-col rounded-xl border bg-card p-5 shadow-xl ${wide ? "max-w-2xl" : "max-w-xl"}`}
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h3 className="text-base font-semibold">{title}</h3>
                        {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={closeDisabled}
                        aria-label="关闭"
                        className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                    >
                        <X className="size-4" />
                    </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
            </div>
        </div>
    );
}

/** 二次确认弹窗（删除 / 设为默认都用它）：danger 时确认按钮变红 */
function ConfirmDialog({
    title,
    message,
    confirmText,
    danger,
    busy,
    onCancel,
    onConfirm,
}: {
    title: string;
    message: React.ReactNode;
    confirmText: string;
    danger?: boolean;
    busy: boolean;
    onCancel: () => void;
    onConfirm: () => void;
}) {
    return (
        <Modal title={title} onClose={busy ? () => {} : onCancel} closeDisabled={busy}>
            <div className="space-y-4">
                <div className="flex items-start gap-2 text-sm text-muted-foreground">
                    <TriangleAlert className={`mt-0.5 size-4 shrink-0 ${danger ? "text-red-500" : "text-amber-500"}`} />
                    <div className="space-y-1">{message}</div>
                </div>
                <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={onCancel} disabled={busy}>
                        取消
                    </Button>
                    <Button
                        onClick={onConfirm}
                        disabled={busy}
                        className={danger ? "bg-red-600 text-white hover:bg-red-600/90" : undefined}
                    >
                        {busy && <Loader2 className="size-3.5 animate-spin" />}
                        {confirmText}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}

/** 带标签 + 说明的字段外壳（后台表单统一节奏，与设置页表单一致） */
function FormRow({
    label,
    description,
    children,
    wide,
}: {
    label: string;
    description?: string;
    children: React.ReactNode;
    wide?: boolean;
}) {
    return (
        <div className={`space-y-1.5 ${wide ? "sm:col-span-2" : ""}`}>
            <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
            {children}
            {description && <p className="text-xs text-muted-foreground/80">{description}</p>}
        </div>
    );
}

// ===================================
//          新建策略弹窗
// ===================================

/** 新建表单里的字段（只收录各类型创建时必填 / 关键项；完整字段分组在编辑页 [id]/page.tsx） */
function CreatePolicyDialog({
    type,
    busy,
    onClose,
    onSubmit,
}: {
    type: string;
    busy: boolean;
    onClose: () => void;
    onSubmit: (values: StoragePolicyFormValues) => void;
}) {
    const [form, setForm] = useState<StoragePolicyFormValues>(() => emptyFormValues(type));

    const patch = (up: Partial<StoragePolicyFormValues>) => setForm((prev) => ({ ...prev, ...up }));
    const patchSettings = (key: string, value: unknown) =>
        setForm((prev) => ({ ...prev, settings: { ...prev.settings, [key]: value } }));

    const isCloud = type !== "local";
    const needsCdnDomain = type === "qiniu_kodo";

    const submit = () => {
        if (!form.name.trim()) {
            toast.error("请填写策略名称");
            return;
        }
        if (!form.virtual_path.trim()) {
            toast.error("请填写应用内挂载路径（如 /oss）");
            return;
        }
        if (!form.virtual_path.trim().startsWith("/")) {
            toast.error("应用内挂载路径必须以 / 开头");
            return;
        }
        if (needsCdnDomain && !String(form.settings.cdn_domain ?? "").trim()) {
            toast.error("七牛云策略必须填写访问域名（settings.cdn_domain）");
            return;
        }
        onSubmit(form);
    };

    return (
        <Modal
            title={`新建存储策略 · ${typeLabel(type)}`}
            description="创建后仍可在编辑页调整完整参数；密钥等敏感字段保存后不再回显"
            onClose={busy ? () => {} : onClose}
            closeDisabled={busy}
            wide
        >
            <div className="space-y-4">
                <p className="rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                    {PROVIDER_HINTS[type] ?? "按存储服务商文档填写参数"}
                </p>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormRow label="策略名称" description="展示名，也会用于向用户展示；后端要求全局唯一">
                        <Input
                            value={form.name}
                            onChange={(e) => patch({ name: e.target.value })}
                            placeholder="例如：文章图片"
                            className="h-8 text-sm"
                            disabled={busy}
                        />
                    </FormRow>

                    <FormRow
                        label="应用内挂载路径"
                        description="只能一级目录（如 /cos、/local），后端会校验唯一性"
                    >
                        <Input
                            value={form.virtual_path}
                            onChange={(e) => patch({ virtual_path: e.target.value })}
                            placeholder="/oss"
                            className="h-8 text-sm"
                            disabled={busy}
                        />
                    </FormRow>

                    {type === "local" && (
                        <FormRow
                            label="存储目录"
                            description="必须在 data/storage/ 下；留空时后端按挂载路径自动生成"
                            wide
                        >
                            <Input
                                value={form.base_path}
                                onChange={(e) => patch({ base_path: e.target.value })}
                                placeholder="data/storage/local"
                                className="h-8 text-sm"
                                disabled={busy}
                            />
                        </FormRow>
                    )}

                    {type === "onedrive" && (
                        <>
                            <FormRow label="Microsoft Graph 端点" description="国际版或世纪互联版">
                                <Select
                                    value={form.server || "https://graph.microsoft.com"}
                                    onValueChange={(v) => patch({ server: v })}
                                    disabled={busy}
                                >
                                    <SelectTrigger className="h-8 w-full text-sm">
                                        <SelectValue placeholder="请选择端点" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="https://graph.microsoft.com">
                                            Microsoft Graph（国际版）
                                        </SelectItem>
                                        <SelectItem value="https://microsoftgraph.chinacloudapi.cn">
                                            世纪互联（中国版）
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            </FormRow>
                            <FormRow label="应用（客户端）ID" description="Azure 门户注册的应用程序 ID">
                                <Input
                                    value={form.bucket_name}
                                    onChange={(e) => patch({ bucket_name: e.target.value })}
                                    className="h-8 text-sm"
                                    disabled={busy}
                                />
                            </FormRow>
                            <FormRow label="客户端密码" description="Azure AD 应用的客户端密码" wide>
                                <Input
                                    type="password"
                                    value={form.secret_key}
                                    onChange={(e) => patch({ secret_key: e.target.value, secret_key_dirty: true })}
                                    className="h-8 text-sm"
                                    disabled={busy}
                                />
                            </FormRow>
                        </>
                    )}

                    {isCloud && type !== "onedrive" && (
                        <>
                            <FormRow label={type === "qiniu_kodo" ? "存储空间" : "存储桶名称"}>
                                <Input
                                    value={form.bucket_name}
                                    onChange={(e) => patch({ bucket_name: e.target.value })}
                                    className="h-8 text-sm"
                                    disabled={busy}
                                />
                            </FormRow>
                            <FormRow label="访问域名 / Endpoint">
                                <Input
                                    value={form.server}
                                    onChange={(e) => patch({ server: e.target.value })}
                                    className="h-8 text-sm"
                                    disabled={busy}
                                />
                            </FormRow>
                            <FormRow label="AccessKey / SecretId">
                                <Input
                                    value={form.access_key}
                                    onChange={(e) => patch({ access_key: e.target.value, access_key_dirty: true })}
                                    className="h-8 text-sm"
                                    disabled={busy}
                                />
                            </FormRow>
                            <FormRow label="SecretKey">
                                <Input
                                    type="password"
                                    value={form.secret_key}
                                    onChange={(e) => patch({ secret_key: e.target.value, secret_key_dirty: true })}
                                    className="h-8 text-sm"
                                    disabled={busy}
                                />
                            </FormRow>
                        </>
                    )}

                    {isCloud && (
                        <FormRow
                            label={needsCdnDomain ? "访问域名（七牛必填）" : "CDN 加速域名（可选）"}
                            description="填写完整的访问地址，用于替换文件 URL 中的主机名"
                            wide
                        >
                            <Input
                                value={String(form.settings.cdn_domain ?? "")}
                                onChange={(e) => patchSettings("cdn_domain", e.target.value)}
                                placeholder="https://cdn.example.com"
                                className="h-8 text-sm"
                                disabled={busy}
                            />
                        </FormRow>
                    )}

                    <FormRow
                        label="单文件大小上限（字节）"
                        description="0 表示不限制；官方前端默认 10485760（10MB）"
                    >
                        <Input
                            type="number"
                            min={0}
                            value={String(form.max_size)}
                            onChange={(e) => patch({ max_size: Number(e.target.value) || 0 })}
                            className="h-8 text-sm tabular-nums"
                            disabled={busy}
                        />
                    </FormRow>
                </div>

                <div className="flex justify-end gap-2 pt-1">
                    <Button variant="outline" onClick={onClose} disabled={busy}>
                        取消
                    </Button>
                    <Button onClick={submit} disabled={busy}>
                        {busy && <Loader2 className="size-3.5 animate-spin" />}
                        创建
                    </Button>
                </div>
            </div>
        </Modal>
    );
}

// ===================================
//        设为默认弹窗
// ===================================

function SetDefaultDialog({
    policy,
    busy,
    onCancel,
    onConfirm,
}: {
    policy: AdminStoragePolicy;
    busy: boolean;
    onCancel: () => void;
    onConfirm: (flag: StoragePolicyFlagValue) => void;
}) {
    const [flag, setFlag] = useState<StoragePolicyFlagValue>(
        () => (POLICY_FLAG_VALUES as readonly string[]).includes(policy.flag ?? "")
            ? (policy.flag as StoragePolicyFlagValue)
            : POLICY_FLAG_VALUES[0]
    );

    return (
        <Modal
            title="设为默认策略"
            description={`把「${policy.name || "该策略"}」设为某个内置用途的默认存储位置`}
            onClose={busy ? () => {} : onCancel}
            closeDisabled={busy}
        >
            <div className="space-y-4">
                <div className="flex items-start gap-2 text-xs text-muted-foreground">
                    <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-500" />
                    <div className="space-y-1">
                        <p>同一用途全局只能有一个默认策略，设置后原持有者的标志会被自动清除。</p>
                        <p>该标志对应的既有文件寻址可能受影响，请确认后再操作。</p>
                    </div>
                </div>

                <FormRow label="默认用途" description="对应后端 flag 字段（article_image / comment_image / user_avatar）" wide>
                    <Select value={flag} onValueChange={(v) => setFlag(v as StoragePolicyFlagValue)} disabled={busy}>
                        <SelectTrigger className="h-8 w-full text-sm">
                            <SelectValue placeholder="请选择用途" />
                        </SelectTrigger>
                        <SelectContent>
                            {FLAG_OPTIONS.map((o) => (
                                <SelectItem key={o.value} value={o.value}>
                                    {o.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </FormRow>

                <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={onCancel} disabled={busy}>
                        取消
                    </Button>
                    <Button onClick={() => onConfirm(flag)} disabled={busy}>
                        {busy && <Loader2 className="size-3.5 animate-spin" />}
                        设为默认
                    </Button>
                </div>
            </div>
        </Modal>
    );
}

// ===================================
//        存储类型选择弹窗
// ===================================

function TypePickerDialog({
    onCancel,
    onPick,
}: {
    onCancel: () => void;
    onPick: (type: string) => void;
}) {
    return (
        <Modal
            title="选择存储类型"
            description="不同类型需要填写的参数不同；创建后类型不可更改"
            onClose={onCancel}
        >
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {TYPE_OPTIONS.map((o) => (
                    <button
                        key={o.value}
                        type="button"
                        onClick={() => onPick(o.value)}
                        className="flex items-center gap-2.5 rounded-lg border bg-card px-3 py-2.5 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
                    >
                        {o.value === "local" ? (
                            <HardDrive className="size-4 shrink-0 text-muted-foreground" />
                        ) : (
                            <Cloud className="size-4 shrink-0 text-primary" />
                        )}
                        <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{o.label}</p>
                            <p className="truncate text-xs text-muted-foreground">{o.value}</p>
                        </div>
                    </button>
                ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground/80">
                后端还支持又拍云（upyun），但官方前端没有对应表单，本轮不在列表页暴露入口。
            </p>
        </Modal>
    );
}

// ===================================
//        主组件
// ===================================

/**
 * 存储策略页：统计磁贴 + 工具栏（新建 / 类型筛选 / 搜索 / 刷新）+ 列表 + 分页。
 * 外壳对齐打赏管理：页面不滚，磁贴 / 工具栏 / 分页固定在卡片上，只有列表区（admin-scroll）内部滚动。
 */
export function StorageManager() {
    const router = useRouter();

    /** 列表数据（远端 /api/policies 全量返回） */
    const [list, setList] = useState<AdminStoragePolicy[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    /** 错误信息：非空时列表区显示可重试的错误态 */
    const [error, setError] = useState<string | null>(null);
    /** 本地筛选：类型 + 关键词（接口没有查询参数，全在前端过滤） */
    const [typeFilter, setTypeFilter] = useState<string>("all");
    const [keyword, setKeyword] = useState("");
    /** 本地分页页码（接口无分页字段，拿全量后在本地 slice） */
    const [page, setPage] = useState(1);
    /** 重试计数：变化即重新拉取 */
    const [refreshKey, setRefreshKey] = useState(0);

    /** 新建流程：先选类型，再填参数 */
    const [pickingType, setPickingType] = useState(false);
    const [createType, setCreateType] = useState<string | null>(null);
    const [createBusy, setCreateBusy] = useState(false);
    /** 删除 / 设为默认：都先经二次确认 */
    const [deleteTarget, setDeleteTarget] = useState<AdminStoragePolicy | null>(null);
    const [defaultTarget, setDefaultTarget] = useState<AdminStoragePolicy | null>(null);
    const [actionBusy, setActionBusy] = useState(false);

    // 拉取列表（浏览器自动携带登录 cookie）。延后到下一个 tick 再 setLoading，
    // 避免在 effect 内同步 setState 触发级联渲染（react-hooks/set-state-in-effect）。
    useEffect(() => {
        let cancelled = false;
        const timer = setTimeout(() => setLoading(true), 0);
        getAdminStoragePoliciesApi()
            .then((data) => {
                if (cancelled) return;
                // 读接口的 StoragePolicy 与写模块的 AdminStoragePolicy 结构一致但 id 类型不同
                // （旧的读类型把 id 标成 number，线上实际是 idgen 编码的字符串公共 ID）。
                // 本轮约定不动 src/types/storage-policy.ts，所以这里显式按未知中转一次再断言。
                const rows = (data?.list ?? []) as unknown as AdminStoragePolicy[];
                setList(rows);
                setTotal(data?.total ?? rows.length);
                setError(null);
            })
            .catch((e) => {
                if (cancelled) return;
                const msg = e instanceof Error ? e.message : "存储策略列表加载失败";
                // 出错时清空列表：错误态独占列表区，不残留旧数据
                setList([]);
                setTotal(0);
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
    }, [refreshKey]);

    /** 重试 / 刷新：计数变化即重拉（筛选条件保留） */
    const retry = useCallback(() => setRefreshKey((k) => k + 1), []);

    const kw = keyword.trim().toLowerCase();
    /** 本地筛选结果（类型 + 名称 / 域名 / 路径关键词） */
    const filtered = useMemo(
        () =>
            list.filter((item) => {
                if (typeFilter !== "all" && item.type !== typeFilter) return false;
                if (!kw) return true;
                const haystack = [item.name, domainOf(item), item.base_path, item.virtual_path, flagLabel(item.flag)]
                    .filter(Boolean)
                    .join(" ")
                    .toLowerCase();
                return haystack.includes(kw);
            }),
        [list, typeFilter, kw]
    );

    const hasFilter = typeFilter !== "all" || kw !== "";
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const currentPage = Math.min(page, totalPages);
    /** 当前页要渲染的行（本地分页） */
    const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

    /** 磁贴数值：按全量列表聚合；加载中 / 出错时用占位符 */
    const statsReady = !loading && !error;
    const tiles = [
        { label: "策略数", value: statsReady ? String(total || list.length) : "—", icon: Server },
        {
            label: "本机存储",
            value: statsReady ? String(list.filter((it) => it.type === "local").length) : "—",
            icon: HardDrive,
        },
        {
            label: "云存储",
            value: statsReady ? String(list.filter((it) => it.type && it.type !== "local").length) : "—",
            icon: Cloud,
        },
        {
            label: "默认策略",
            value: statsReady ? String(list.filter((it) => !!it.flag).length) : "—",
            icon: Star,
        },
    ];

    // ---------------- 写操作 ----------------

    /** 新建：提交后刷新列表；OneDrive 需要接着去授权，所以直接进编辑页 */
    const submitCreate = async (values: StoragePolicyFormValues) => {
        setCreateBusy(true);
        try {
            const created = await createAdminStoragePolicyApi(formValuesToPayload(values));
            toast.success(`策略「${created?.name || values.name}」创建成功`);
            setCreateType(null);
            retry();
            if (values.type === "onedrive" && created?.id) {
                toast.info("OneDrive 还需要完成 OAuth 授权，已为你打开编辑页");
                router.push(`/admin/storage/${created.id}`);
            }
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "创建存储策略失败");
        } finally {
            setCreateBusy(false);
        }
    };

    /**
     * 删除：二次确认后调用。
     * 受保护策略（内置 flag / 根路径 / id=1）不进入流程，按钮本身就是 disabled 的，
     * 这里再挡一次，避免键盘 / 程序化触发绕过。
     */
    const confirmDelete = async () => {
        if (!deleteTarget?.id) return;
        const blocked = deleteBlockReason(deleteTarget);
        if (blocked) {
            toast.error(blocked);
            setDeleteTarget(null);
            return;
        }
        setActionBusy(true);
        try {
            await deleteAdminStoragePolicyApi(deleteTarget.id);
            toast.success(`策略「${deleteTarget.name || deleteTarget.id}」已删除`);
            setDeleteTarget(null);
            retry();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "删除存储策略失败");
        } finally {
            setActionBusy(false);
        }
    };

    /**
     * 设为默认：先 GET 详情拿到完整字段（列表项返回的字段足够，但详情更保险），
     * 再整体 PUT 并把 flag 改成所选用途 —— 后端靠 flag 唯一性自动清掉旧的持有者。
     */
    const confirmSetDefault = async (flag: StoragePolicyFlagValue) => {
        if (!defaultTarget?.id) return;
        setActionBusy(true);
        try {
            const detail = await getAdminStoragePolicyApi(defaultTarget.id);
            const values = policyValuesOf(detail, defaultTarget);
            await updateAdminStoragePolicyApi(defaultTarget.id, formValuesWithFlag(values, flag));
            toast.success(`已把「${defaultTarget.name || defaultTarget.id}」设为${flagLabel(flag)}`);
            setDefaultTarget(null);
            retry();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "设为默认失败");
        } finally {
            setActionBusy(false);
        }
    };

    // 任何宽度都用同一套列模板：窄屏靠 .admin-scroll 横向滚动、操作列 sticky 固定，不再折成卡片。
    // 窄屏也保持 min-w：整张表横向滚动，列不会被压扁。
    const rowGrid = "grid-cols-[minmax(0,1fr)_104px_minmax(0,1.1fr)_88px_112px_56px_144px_144px]";
    const rowMinW = "min-w-[1060px]";

    return (
        <div className="admin-card">
            {/* 统计磁贴：固定在卡片顶部（shrink-0），不随列表滚动 */}
            <div className="grid shrink-0 grid-cols-2 gap-2 border-b p-3 md:grid-cols-4">
                {tiles.map((t) => (
                    <div key={t.label} className="flex items-start justify-between gap-2 rounded-lg border bg-muted/40 px-3 py-2">
                        <div>
                            <p className="text-xs text-muted-foreground">{t.label}</p>
                            <p className="text-lg font-semibold tabular-nums">{t.value}</p>
                        </div>
                        <t.icon className="size-4 shrink-0 text-muted-foreground/60" />
                    </div>
                ))}
            </div>

            {/* 工具栏：固定在卡片顶部（shrink-0），不随下方列表滚动 */}
            <div className="flex shrink-0 flex-col gap-2 border-b bg-muted/40 px-4 py-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
                <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        类型
                        <Select
                            value={typeFilter}
                            onValueChange={(v) => {
                                setTypeFilter(v);
                                setPage(1);
                            }}
                        >
                            <SelectTrigger className="h-7 w-full min-w-0 text-xs sm:w-max">
                                <SelectValue placeholder="全部" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">全部</SelectItem>
                                {TYPE_OPTIONS.map((o) => (
                                    <SelectItem key={o.value} value={o.value}>
                                        {o.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <span className="text-xs text-muted-foreground">
                        共 <span className="font-medium text-foreground">{filtered.length}</span> 个存储策略
                    </span>
                </div>
                <div className="flex flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
                    <div className="relative w-full sm:w-auto">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={keyword}
                            onChange={(e) => {
                                setKeyword(e.target.value);
                                setPage(1);
                            }}
                            placeholder="搜索策略名称 / 域名…"
                            className="h-7 w-full pl-8 text-xs sm:w-56"
                        />
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-7 shrink-0 px-2 text-xs"
                        onClick={retry}
                        disabled={loading}
                        title="重新拉取存储策略列表"
                    >
                        <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
                        <span className="hidden sm:inline">刷新</span>
                    </Button>
                    <Button
                        size="sm"
                        className="h-7 shrink-0 bg-primary px-2 text-xs text-primary-foreground hover:bg-primary/90"
                        onClick={() => setPickingType(true)}
                    >
                        <Plus className="size-3.5" />
                        <span className="hidden sm:inline">新建策略</span>
                    </Button>
                </div>
            </div>

            {/* 列表：卡片内唯一滚动区（表头吸顶），工具栏与分页都不动。
                加载 / 空 / 错误三态都渲染在这个 admin-scroll 里，外壳保持不变 */}
            <div className="admin-scroll">
                {/* 表头：任何宽度都显示（窄屏横向滚动时需要列名） */}
                <div
                    className={`admin-sticky-head admin-list-head items-center gap-3 border-b px-4 py-2.5 text-xs font-medium text-muted-foreground grid ${rowMinW} ${rowGrid}`}
                >
                    <span>策略名称</span>
                    <span>类型</span>
                    <span>访问域名</span>
                    <span>最大文件</span>
                    <span>用途</span>
                    <span className="text-center">私有</span>
                    <span>创建时间</span>
                    <span className="text-right">操作</span>
                </div>

                {loading ? (
                    <div aria-busy="true" aria-label="加载中">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <div
                                key={i}
                                className={`grid admin-list-row items-center gap-x-3 gap-y-2 border-b px-4 py-3 sm:gap-y-1 ${rowMinW} ${rowGrid}`}
                            >
                                <div className="h-3 w-28 animate-pulse rounded bg-muted" />
                                <div className="h-3 w-16 animate-pulse rounded bg-muted" />
                                <div className="h-3 w-32 animate-pulse rounded bg-muted" />
                                <div className="h-3 w-14 animate-pulse rounded bg-muted" />
                                <div className="h-3 w-20 animate-pulse rounded bg-muted" />
                                <div className="h-3 w-8 animate-pulse rounded bg-muted sm:mx-auto" />
                                <div className="h-3 w-24 animate-pulse rounded bg-muted" />
                                <div className="h-6 w-24 animate-pulse rounded bg-muted sm:ml-auto" />
                            </div>
                        ))}
                    </div>
                ) : error ? (
                    // 错误态：消息 + 重试，页面不白屏
                    <div className="flex min-h-64 flex-col items-center justify-center gap-2 px-4 py-12 text-center">
                        <span className="flex size-12 items-center justify-center rounded-full border bg-destructive/10">
                            <Server className="size-5 text-destructive" />
                        </span>
                        <p className="text-sm font-medium text-destructive">存储策略加载失败</p>
                        <p className="max-w-md text-xs text-muted-foreground">{error}</p>
                        <p className="max-w-md text-xs text-muted-foreground/70">
                            远端 /api/policies 需要登录且可能未开放，可稍后重试
                        </p>
                        <Button variant="outline" size="sm" className="mt-1 h-8 rounded-lg text-xs" onClick={retry}>
                            <RefreshCw className="size-3.5" />
                            重试
                        </Button>
                    </div>
                ) : pageRows.length === 0 ? (
                    // 空态：区分「筛选没匹配」与「确实没数据」
                    <div className="flex min-h-64 flex-col items-center justify-center gap-1.5 px-4 py-12 text-sm text-muted-foreground">
                        <Server className="size-5 opacity-60" />
                        <span>{hasFilter ? "没有匹配的存储策略" : "暂无存储策略"}</span>
                        <span className="text-xs text-muted-foreground/70">
                            {hasFilter ? "换个类型或关键词试试" : "远端返回的列表为空"}
                        </span>
                    </div>
                ) : (
                    pageRows.map((item, index) => (
                        <PolicyRow
                            key={item.id ?? `${item.name}-${index}`}
                            item={item}
                            gridCls={`${rowMinW} ${rowGrid}`}
                            onEdit={() => router.push(`/admin/storage/${item.id}`)}
                            onSetDefault={() => setDefaultTarget(item)}
                            onDelete={() => setDeleteTarget(item)}
                        />
                    ))
                )}
            </div>

            {/* 分页：固定在卡片底部，不随列表滚动。
                ⚠️ /policies 无分页字段 → 这里是**本地分页**（全量 list 上 slice），不发分页参数 */}
            <div className="flex shrink-0 items-center justify-between gap-3 border-t bg-muted/40 px-4 py-2.5 text-xs text-muted-foreground">
                <span>
                    共 {filtered.length} 条 · 第 {currentPage}/{totalPages} 页
                </span>
                <PaginationControls
                    page={currentPage}
                    totalPages={totalPages}
                    onPageChange={setPage}
                    disabled={loading || !!error}
                />
            </div>

            {/* ---------------- 弹窗层 ---------------- */}

            {pickingType && (
                <TypePickerDialog
                    onCancel={() => setPickingType(false)}
                    onPick={(type) => {
                        setPickingType(false);
                        setCreateType(type);
                    }}
                />
            )}

            {createType && (
                <CreatePolicyDialog
                    key={createType}
                    type={createType}
                    busy={createBusy}
                    onClose={() => setCreateType(null)}
                    onSubmit={submitCreate}
                />
            )}

            {defaultTarget && (
                <SetDefaultDialog
                    policy={defaultTarget}
                    busy={actionBusy}
                    onCancel={() => setDefaultTarget(null)}
                    onConfirm={confirmSetDefault}
                />
            )}

            {deleteTarget && (
                <ConfirmDialog
                    title="删除存储策略"
                    danger
                    busy={actionBusy}
                    confirmText="删除"
                    onCancel={() => setDeleteTarget(null)}
                    onConfirm={confirmDelete}
                    message={
                        <>
                            <p>
                                确认删除策略「
                                <span className="font-medium text-foreground">{deleteTarget.name || deleteTarget.id}</span>
                                」吗？
                            </p>
                            <p>删除只软删策略本身，不会删除已上传的文件；但依赖该策略寻址的文件可能无法访问。</p>
                        </>
                    }
                />
            )}
        </div>
    );
}

/** 单行策略（含操作列）：受保护策略的删除按钮直接 disabled + 文案说明 */
function PolicyRow({
    item,
    gridCls,
    onEdit,
    onSetDefault,
    onDelete,
}: {
    item: AdminStoragePolicy;
    gridCls: string;
    onEdit: () => void;
    onSetDefault: () => void;
    onDelete: () => void;
}) {
    const blocked = deleteBlockReason(item);
    const alreadyDefault = !!item.flag;

    return (
        <div
            className={`grid admin-list-row items-center gap-x-3 gap-y-2 border-b px-4 py-3 text-sm transition-colors last:border-b-0 hover:bg-muted/40 sm:gap-y-1 ${gridCls}`}
        >
            <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                    <span className="truncate font-medium text-foreground">{item.name || "—"}</span>
                    {item.flag && (
                        <span className="shrink-0 rounded-full bg-amber-500/10 px-1.5 py-px text-[10px] font-medium text-amber-600 dark:text-amber-400">
                            {flagLabel(item.flag)}
                        </span>
                    )}
                </div>
                {item.base_path && <div className="truncate text-xs text-muted-foreground">{item.base_path}</div>}
            </div>
            <div>
                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${typeBadgeCls(item.type)}`}>
                    {typeLabel(item.type)}
                </span>
            </div>
            <div className="min-w-0 truncate text-xs text-muted-foreground">
                {domainOf(item)}
            </div>
            <div className="text-xs tabular-nums text-muted-foreground">
                {formatMaxSize(item.max_size)}
            </div>
            <div className="text-xs text-muted-foreground">
                {flagLabel(item.flag)}
            </div>
            <div className="sm:text-center">
                {item.is_private ? (
                    <span className="inline-block rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-600 dark:text-red-400">
                        私有
                    </span>
                ) : (
                    <span className="inline-block rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        公开
                    </span>
                )}
            </div>
            <div className="text-xs tabular-nums text-muted-foreground">{formatDateTime(item.created_at)}</div>
            <div className="flex items-center gap-1 sm:justify-end">
                <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="编辑"
                    title="编辑（会打开编辑页，保存前会提示可能影响已有文件访问）"
                    className={ACTION_TONE.edit}
                    onClick={onEdit}
                >
                    <Pencil className="size-4" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="设为默认"
                    title={
                        alreadyDefault
                            ? `已是${flagLabel(item.flag)}默认策略，可改用其他用途`
                            : "设为默认（需二次确认，可能影响已有文件寻址）"
                    }
                    className={alreadyDefault ? "rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400" : ACTION_TONE.pin}
                    onClick={onSetDefault}
                >
                    <Star className={`size-4 ${alreadyDefault ? "fill-current" : ""}`} />
                </Button>
                <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="删除"
                    title={blocked ?? "删除（需二次确认，不影响已上传文件）"}
                    className={ACTION_TONE.delete}
                    disabled={!!blocked}
                    onClick={onDelete}
                >
                    <Trash2 className="size-4" />
                </Button>
            </div>
        </div>
    );
}

/** 详情接口失败时的兜底：优先用详情，其次退回列表项 */
function policyValuesOf(detail: AdminStoragePolicy, fallback: AdminStoragePolicy): StoragePolicyFormValues {
    return policyToFormValues(detail?.name ? detail : fallback);
}
