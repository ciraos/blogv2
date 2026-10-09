"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
    Download,
    Info,
    KeyRound,
    Loader2,
    Package,
    Plug,
    PlugZap,
    Power,
    PowerOff,
    Puzzle,
    RefreshCw,
    RotateCw,
    Search,
    Settings,
    Trash2,
    TriangleAlert,
    X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { ACTION_TONE } from "@/lib/action-tones";
import { cn } from "@/lib/utils";
import {
    disableAdminPluginApi,
    enableAdminPluginApi,
    getAdminPluginsApi,
    installAdminPluginApi,
    isPluginDisabled,
    pluginStatusMeta,
    reloadAdminPluginApi,
    uninstallAdminPluginApi,
    updateAdminPluginConfigApi,
} from "@/lib/api-plugins";
import type { AdminPlugin, PluginConfigField } from "@/lib/api-plugins";

/* =============================================================================
 * 插件管理（真实接口）
 *
 * 接口清单（源码证据：pkg/handler/plugin_admin/handler.go:189-196 的路由注册）：
 *   GET    /api/admin/plugins              → 远端 GET    /admin/plugins            （handler.go:39  List）
 *   POST   /api/admin/plugins/install      → 远端 POST   /admin/plugins/install     （handler.go:105 Install）
 *   DELETE /api/admin/plugins/:id          → 远端 DELETE /admin/plugins/:id         （handler.go:148 Uninstall）
 *   POST   /api/admin/plugins/:id/reload   → 远端 POST   /admin/plugins/:id/reload  （handler.go:51  Reload）
 *   POST   /api/admin/plugins/:id/disable  → 远端 POST   /admin/plugins/:id/disable （handler.go:69  Disable）
 *   POST   /api/admin/plugins/:id/enable   → 远端 POST   /admin/plugins/:id/enable  （handler.go:87  Enable）
 *   PUT    /api/admin/plugins/:id/config   → 远端 PUT    /admin/plugins/:id/config  （handler.go:166 UpdateConfig）
 *
 * 本页只做「读」（GET 列表）实测；**所有写操作本轮都不实测**（会改线上插件运行状态），
 * 但都接了真实接口，并且每个写操作都必须先过确认弹窗。
 * ========================================================================== */

/** 安装包大小上限：与代理 route 的前置校验保持一致（src/proxy.ts 会克隆请求体，默认 10MB 上限） */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** 状态筛选选项 */
const STATUS_OPTIONS = [
    { value: "running", label: "运行中" },
    { value: "disabled", label: "已停用" },
    { value: "stopped", label: "已停止" },
    { value: "error", label: "加载失败" },
];

/** 时间戳（YYYY-MM-DD HH:MM，本地时区） */
function formatDateTime(iso?: string): string {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 能力类型 → 中文标签（后端 metadata.types 是 "searcher" / "eventhook"） */
const CAPABILITY_LABEL: Record<string, string> = {
    searcher: "搜索引擎",
    eventhook: "事件钩子",
};

const capabilityLabel = (type: string) => CAPABILITY_LABEL[type] ?? type;

/** 统计磁贴：图标色块 + 标签 + 数值 */
function StatTile({
    icon: Icon,
    label,
    value,
    tone,
}: {
    icon: typeof Package;
    label: string;
    value: string;
    tone: string;
}) {
    return (
        <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2">
            <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${tone}`}>
                <Icon className="size-4" />
            </span>
            <div className="min-w-0">
                <p className="truncate text-xs text-muted-foreground">{label}</p>
                <p className="text-lg font-semibold tabular-nums">{value}</p>
            </div>
        </div>
    );
}

/** 弹窗外壳：项目里没有 Dialog 组件（components.json 只装了 Sheet），沿用打赏/说说的手写模态框写法 */
function Modal({
    title,
    description,
    onClose,
    children,
    wide,
}: {
    title: string;
    description?: string;
    onClose: () => void;
    children: ReactNode;
    wide?: boolean;
}) {
    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onMouseDown={onClose}
            role="dialog"
            aria-modal="true"
            aria-label={title}
        >
            <div
                className={cn(
                    "flex max-h-[86vh] w-full flex-col rounded-xl border bg-card p-4 shadow-xl",
                    wide ? "max-w-2xl" : "max-w-xl"
                )}
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h3 className="text-base font-semibold">{title}</h3>
                        {description && (
                            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="关闭"
                        className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                        <X className="size-4" />
                    </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
            </div>
        </div>
    );
}

/**
 * 二次确认弹窗：卸载 / 停用 / 启用 / 重载 / 保存配置 / 安装 全部经过它。
 * danger=true 时确认按钮用红色（卸载、停用这类不可逆或影响运行的动作）。
 */
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
    message: ReactNode;
    confirmText: string;
    danger?: boolean;
    busy: boolean;
    onCancel: () => void;
    onConfirm: () => void;
}) {
    return (
        <Modal title={title} onClose={busy ? () => {} : onCancel}>
            <div className="space-y-3">
                <div className="flex items-start gap-2 text-sm text-muted-foreground">
                    <TriangleAlert
                        className={cn("mt-0.5 size-4 shrink-0", danger ? "text-red-500" : "text-amber-500")}
                    />
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

/** 安装弹窗：选一个 zip 安装包上传（后端只接受 .zip，字段名固定 file） */
function InstallDialog({
    onClose,
    onDone,
}: {
    onClose: () => void;
    onDone: () => void;
}) {
    const [file, setFile] = useState<File | null>(null);
    const [busy, setBusy] = useState(false);

    /** 选文件时先做本地校验（扩展名 + 10MB 转发上限），不合格不进入确认流程 */
    const pick = (picked: File | null) => {
        if (!picked) {
            setFile(null);
            return;
        }
        if (!picked.name.toLowerCase().endsWith(".zip")) {
            toast.error("插件安装包必须是 zip 格式");
            return;
        }
        if (picked.size > MAX_UPLOAD_BYTES) {
            toast.error(
                `安装包 ${(picked.size / 1024 / 1024).toFixed(1)}MB 超过本站 10MB 转发上限（后端本身允许 100MB）`
            );
            return;
        }
        setFile(picked);
    };

    const submit = async () => {
        if (!file) {
            toast.error("请先选择 zip 安装包");
            return;
        }
        setBusy(true);
        try {
            const info = await installAdminPluginApi(file);
            toast.success(info?.metadata?.name ? `插件「${info.metadata.name}」安装成功` : "插件安装成功");
            onDone();
            onClose();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "插件安装失败");
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal
            title="安装插件"
            description="上传插件 zip 安装包（后端接口要求 multipart 字段名 file，且只接受 .zip）"
            onClose={busy ? () => {} : onClose}
        >
            <div className="space-y-3">
                <label className="block">
                    <span className="mb-1 block text-xs font-medium text-muted-foreground">
                        安装包（zip，≤ 10MB）
                    </span>
                    <Input
                        type="file"
                        accept=".zip,application/zip"
                        disabled={busy}
                        onChange={(e) => pick(e.target.files?.[0] ?? null)}
                        className="h-8 py-1 text-xs"
                    />
                </label>

                {file && (
                    <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-xs">
                        <Package className="size-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate">{file.name}</span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">
                            {(file.size / 1024 / 1024).toFixed(2)} MB
                        </span>
                    </div>
                )}

                <p className="flex items-start gap-1.5 text-xs text-muted-foreground/80">
                    <Info className="mt-0.5 size-3.5 shrink-0" />
                    <span>
                        同名插件重复安装即为升级（后端 InstallFromZip 会覆盖插件目录）。
                        本站中间件会克隆请求体、默认只缓冲前 10MB，所以这里限制 10MB；后端本身允许 100MB。
                    </span>
                </p>

                <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={onClose} disabled={busy}>
                        取消
                    </Button>
                    <Button onClick={submit} disabled={busy || !file}>
                        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                        {busy ? "安装中…" : "开始安装"}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}

/** 配置弹窗的初始值：优先用已保存的 config，缺项回退到 schema 的 default */
function initialConfigValues(plugin: AdminPlugin): Record<string, string> {
    const values: Record<string, string> = {};
    for (const field of plugin.config_schema ?? []) {
        values[field.key] = plugin.config?.[field.key] ?? field.default ?? "";
    }
    // schema 之外的存量键也带上，避免保存时把插件自定义的键丢掉
    for (const [key, value] of Object.entries(plugin.config ?? {})) {
        if (!(key in values)) values[key] = value;
    }
    return values;
}

/**
 * 配置弹窗：插件声明了 config_schema 就按 schema 动态渲染表单；
 * 没有 schema（裸二进制插件，或 manifest 未声明）时退化为 JSON 文本编辑，并在界面上说明原因。
 *
 * 注意：secret 只是用密码框展示（列表接口会回传真实值，前端不做遮蔽/不回显是做不到的），
 * 不代表前端隐藏了它。
 */
function ConfigDialog({
    plugin,
    onClose,
    onSaved,
}: {
    plugin: AdminPlugin;
    onClose: () => void;
    onSaved: () => void;
}) {
    const schema: PluginConfigField[] = plugin.config_schema ?? [];
    const hasSchema = schema.length > 0;

    const [values, setValues] = useState<Record<string, string>>(() => initialConfigValues(plugin));
    const [jsonText, setJsonText] = useState(() =>
        JSON.stringify(plugin.config ?? {}, null, 2)
    );
    const [saving, setSaving] = useState(false);

    /** 组装要提交的 config：有 schema 用表单值，没有则解析 JSON 文本 */
    const buildConfig = (): Record<string, string> | null => {
        if (hasSchema) {
            // 布尔项统一按 "true"/"false" 提交（后端 map value 是 string）
            return values;
        }
        try {
            const parsed: unknown = JSON.parse(jsonText || "{}");
            if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
                toast.error("配置必须是 JSON 对象");
                return null;
            }
            const out: Record<string, string> = {};
            for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
                if (value === null || value === undefined) continue;
                out[key] = typeof value === "string" ? value : String(value);
            }
            return out;
        } catch {
            toast.error("JSON 解析失败，请检查格式");
            return null;
        }
    };

    /** 必填校验：与后端 registry.go:742-746 的校验口径一致（必填项不能为空） */
    const validate = (config: Record<string, string>): boolean => {
        const missing = schema.filter((f) => f.required && !config[f.key]?.trim());
        if (missing.length > 0) {
            toast.error(`请填写必填项：${missing.map((f) => f.label || f.key).join("、")}`);
            return false;
        }
        return true;
    };

    const save = async () => {
        const config = buildConfig();
        if (!config || !validate(config)) return;
        setSaving(true);
        try {
            await updateAdminPluginConfigApi(plugin.metadata.id, config);
            toast.success("插件配置已保存（运行中的插件会自动重载生效）");
            onSaved();
            onClose();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "保存插件配置失败");
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal
            title={`配置 · ${plugin.metadata.name || plugin.metadata.id}`}
            description={`插件 id：${plugin.metadata.id}`}
            onClose={saving ? () => {} : onClose}
            wide
        >
            <div className="space-y-3">
                {hasSchema ? (
                    <div className="space-y-3">
                        {schema.map((field) => {
                            const value = values[field.key] ?? "";
                            const setValue = (v: string) =>
                                setValues((prev) => ({ ...prev, [field.key]: v }));
                            return (
                                <label key={field.key} className="block">
                                    <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                                        {field.secret && <KeyRound className="size-3.5" />}
                                        {field.label || field.key}
                                        {field.required && <span className="text-red-500">*</span>}
                                        <span className="text-muted-foreground/60">（{field.key}）</span>
                                    </span>
                                    {field.type === "select" ? (
                                        <Select value={value} onValueChange={setValue}>
                                            <SelectTrigger className="h-8 w-full">
                                                <SelectValue placeholder="请选择" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {(field.options ?? []).map((option) => (
                                                    <SelectItem key={option} value={option}>
                                                        {option}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    ) : field.type === "boolean" ? (
                                        <Select
                                            value={value === "" ? "false" : value}
                                            onValueChange={setValue}
                                        >
                                            <SelectTrigger className="h-8 w-full">
                                                <SelectValue placeholder="请选择" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="true">true（开启）</SelectItem>
                                                <SelectItem value="false">false（关闭）</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    ) : (
                                        <Input
                                            type={
                                                field.secret
                                                    ? "password"
                                                    : field.type === "number"
                                                      ? "number"
                                                      : "text"
                                            }
                                            value={value}
                                            onChange={(e) => setValue(e.target.value)}
                                            placeholder={field.default || ""}
                                            autoComplete="off"
                                        />
                                    )}
                                    {field.description && (
                                        <span className="mt-1 block text-xs text-muted-foreground/80">
                                            {field.description}
                                        </span>
                                    )}
                                </label>
                            );
                        })}
                    </div>
                ) : (
                    <div className="space-y-2">
                        <p className="flex items-start gap-1.5 rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                            <Info className="mt-0.5 size-3.5 shrink-0" />
                            <span>
                                该插件没有声明 config_schema（裸二进制插件，或 plugin.json 未写
                                config_schema），拿不到字段定义，因此退化为 JSON 文本编辑。
                                值统一按字符串提交（后端 config 是 map[string]string）。
                            </span>
                        </p>
                        <textarea
                            value={jsonText}
                            onChange={(e) => setJsonText(e.target.value)}
                            spellCheck={false}
                            rows={12}
                            aria-label="插件配置 JSON"
                            className="w-full rounded-lg border bg-background px-3 py-2 font-mono text-xs leading-relaxed outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                        />
                    </div>
                )}

                <div className="flex items-center justify-between gap-2 border-t pt-3">
                    <span className="text-xs text-muted-foreground/80">
                        保存后运行中的插件会自动重载以应用新配置。
                    </span>
                    <div className="flex shrink-0 gap-2">
                        <Button variant="outline" onClick={onClose} disabled={saving}>
                            取消
                        </Button>
                        <Button onClick={save} disabled={saving}>
                            {saving && <Loader2 className="size-3.5 animate-spin" />}
                            保存配置
                        </Button>
                    </div>
                </div>
            </div>
        </Modal>
    );
}

/**
 * 插件管理：统计磁贴 + 搜索/筛选工具栏 + 插件列表（真实接口）。
 *
 * 加载策略：进页面拉一次 GET 列表；「刷新」强制重拉；写操作成功后（除了本次不实测的原则）
 * 一律重新拉列表，保证状态与服务端一致。
 * 搜索/状态筛选都是本地过滤 —— 后端 list 接口没有任何查询参数（handler.go:39 只返回 manager.List()）。
 */
export function PluginsManager() {
    const [plugins, setPlugins] = useState<AdminPlugin[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [input, setInput] = useState("");
    const [keyword, setKeyword] = useState("");
    const [status, setStatus] = useState("all");

    /** 安装弹窗 */
    const [installOpen, setInstallOpen] = useState(false);

    /** 二次确认弹窗（卸载 / 停用 / 启用 / 重载 / 保存配置） */
    const [confirm, setConfirm] = useState<{
        kind: "uninstall" | "disable" | "enable" | "reload";
        plugin: AdminPlugin;
    } | null>(null);
    const [confirmBusy, setConfirmBusy] = useState(false);

    /** 配置弹窗 */
    const [configPlugin, setConfigPlugin] = useState<AdminPlugin | null>(null);

    /** 请求序号：晚到的响应不能覆盖新请求的结果 */
    const reqIdRef = useRef(0);

    const load = useCallback(async () => {
        const reqId = ++reqIdRef.current;
        setLoading(true);
        setError(null);
        try {
            const list = await getAdminPluginsApi();
            if (reqId !== reqIdRef.current) return;
            setPlugins(list);
        } catch (e) {
            if (reqId !== reqIdRef.current) return;
            const message = e instanceof Error && e.message ? e.message : "请稍后重试";
            setError(message);
            toast.error(`插件列表加载失败：${message}`);
        } finally {
            if (reqId === reqIdRef.current) setLoading(false);
        }
    }, []);

    useEffect(() => {
        // 延后一个 tick 发起，避免 effect 内同步 setState 触发级联渲染
        const timer = setTimeout(() => void load(), 0);
        return () => clearTimeout(timer);
    }, [load]);

    const source = useMemo(() => plugins ?? [], [plugins]);

    const hasFilter = keyword.trim() !== "" || status !== "all";

    /** 本地过滤：名称 / id / 描述 / 作者 命中关键词 + 状态匹配 */
    const rows = useMemo(() => {
        const kw = keyword.trim().toLowerCase();
        return source.filter((p) => {
            const matchKeyword =
                !kw ||
                [p.metadata?.name, p.metadata?.id, p.metadata?.description, p.metadata?.author].some((v) =>
                    (v ?? "").toLowerCase().includes(kw)
                );
            const matchStatus = status === "all" || p.status === status;
            return matchKeyword && matchStatus;
        });
    }, [source, keyword, status]);

    const tiles = useMemo(() => {
        const ready = plugins !== null;
        return [
            {
                label: "已安装",
                value: ready ? String(source.length) : "—",
                icon: Package,
                tone: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
            },
            {
                label: "运行中",
                value: ready ? String(source.filter((p) => p.status === "running").length) : "—",
                icon: Plug,
                tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
            },
            {
                label: "已停用",
                value: ready ? String(source.filter((p) => p.status === "disabled").length) : "—",
                icon: PowerOff,
                tone: "bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400",
            },
            {
                label: "加载失败",
                value: ready ? String(source.filter((p) => p.status === "error").length) : "—",
                icon: TriangleAlert,
                tone: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
            },
        ];
    }, [plugins, source]);

    /** 执行确认过的写操作；成功后刷新列表 */
    const runConfirmedAction = async () => {
        if (!confirm) return;
        const { kind, plugin } = confirm;
        const id = plugin.metadata.id;
        setConfirmBusy(true);
        try {
            if (kind === "uninstall") {
                await uninstallAdminPluginApi(id);
                toast.success(`插件「${plugin.metadata.name || id}」已卸载`);
            } else if (kind === "disable") {
                await disableAdminPluginApi(id);
                toast.success(`插件「${plugin.metadata.name || id}」已停用`);
            } else if (kind === "enable") {
                await enableAdminPluginApi(id);
                toast.success(`插件「${plugin.metadata.name || id}」已启用`);
            } else {
                await reloadAdminPluginApi(id);
                toast.success(`插件「${plugin.metadata.name || id}」已重新加载`);
            }
            setConfirm(null);
            await load();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "操作失败");
        } finally {
            setConfirmBusy(false);
        }
    };

    // 移动端(<640px)：grid-cols-1 把每个单元格竖排成卡片；≥640px：恢复表格式列布局。
    // min-w 只写在 sm: 以上 —— 窄屏若也撑宽，卡片就会被拉出横向滚动。
    const rowGrid = "sm:grid-cols-[minmax(0,1fr)_120px_120px_96px_104px]";
    const rowMinW = "sm:min-w-[860px]";

    return (
        <div className="admin-card">
            {/* 统计磁贴：固定在卡片顶部（shrink-0），不随列表滚动 */}
            <div className="grid shrink-0 grid-cols-2 gap-2 border-b p-3 md:grid-cols-4">
                {tiles.map((t) => (
                    <StatTile key={t.label} icon={t.icon} label={t.label} value={t.value} tone={t.tone} />
                ))}
            </div>

            {/* 工具栏：固定在卡片顶部（shrink-0），不随下方列表滚动 */}
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b bg-muted/40 px-4 py-2">
                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative w-52">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={input}
                            onChange={(e) => {
                                setInput(e.target.value);
                                setKeyword(e.target.value);
                            }}
                            placeholder="搜索插件名称、id、简介、作者"
                            className="h-8 pl-8 pr-7 text-xs"
                            aria-label="搜索插件"
                        />
                        {input && (
                            <button
                                type="button"
                                onClick={() => {
                                    setInput("");
                                    setKeyword("");
                                }}
                                aria-label="清空搜索"
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>

                    <Select value={status} onValueChange={setStatus}>
                        <SelectTrigger className="h-8 w-26 shrink-0 text-xs" aria-label="状态筛选">
                            <SelectValue placeholder="全部状态" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">全部状态</SelectItem>
                            {STATUS_OPTIONS.map((o) => (
                                <SelectItem key={o.value} value={o.value}>
                                    {o.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <span className="text-xs text-muted-foreground">
                        共 <span className="font-medium text-foreground">{plugins ? rows.length : "—"}</span> 个插件
                    </span>
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        size="sm"
                        className="h-8 px-2 text-xs"
                        onClick={() => setInstallOpen(true)}
                    >
                        <Download className="size-3.5" />
                        安装插件
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-2 text-xs"
                        disabled={loading}
                        onClick={() => void load()}
                    >
                        {loading ? (
                            <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                            <RefreshCw className="size-3.5" />
                        )}
                        刷新
                    </Button>
                </div>
            </div>

            {/* 列表：卡片内唯一滚动区（表头吸顶） */}
            <div className="admin-scroll">
                {/* 表头：移动端隐藏（卡片自带行内信息），≥sm 才以 grid 显示 */}
                <div
                    className={`admin-sticky-head hidden items-center gap-3 border-b px-4 py-2 text-xs font-medium text-muted-foreground sm:grid ${rowMinW} ${rowGrid}`}
                >
                    <span>插件</span>
                    <span>版本</span>
                    <span>作者</span>
                    <span>状态</span>
                    <span className="text-right">操作</span>
                </div>

                {loading && plugins === null ? (
                    <div className="flex flex-col items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                        <Loader2 className="size-5 animate-spin opacity-60" />
                        <span>正在加载插件列表…</span>
                    </div>
                ) : error ? (
                    <div className="flex flex-col items-center justify-center gap-2 py-8 text-sm">
                        <TriangleAlert className="size-6 text-destructive" />
                        <p className="text-destructive">{error}</p>
                        <p className="text-xs text-muted-foreground">
                            请检查后端 GET /api/admin/plugins 是否可用
                        </p>
                        <Button
                            variant="outline"
                            size="sm"
                            className="mt-1 h-8 px-2 text-xs"
                            onClick={() => void load()}
                        >
                            <RefreshCw className="size-3.5" />
                            重试
                        </Button>
                    </div>
                ) : rows.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-1.5 py-8 text-sm text-muted-foreground">
                        <Puzzle className="size-5 opacity-60" />
                        <span>{hasFilter ? "没有匹配的插件" : "暂无插件"}</span>
                        <span className="text-xs text-muted-foreground/70">
                            {hasFilter ? `共 ${source.length} 个插件，换个关键词试试` : "data/plugins 目录下没有可用插件"}
                        </span>
                    </div>
                ) : (
                    rows.map((p) => {
                        const badge = pluginStatusMeta(p.status);
                        const id = p.metadata.id;
                        const disabled = isPluginDisabled(p.status);
                        const caps = p.capabilities?.length ? p.capabilities : (p.metadata.types ?? []);
                        return (
                            <div
                                key={id}
                                className={`grid grid-cols-1 items-center gap-x-3 gap-y-2 border-b px-4 py-3 text-sm transition-colors last:border-b-0 hover:bg-muted/40 sm:gap-y-1 ${rowMinW} ${rowGrid}`}
                            >
                                {/* 插件：图标 + 名称 + 一行简介 + 能力标签 */}
                                <div className="flex items-start gap-2">
                                    <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                                        <Puzzle className="size-4" />
                                    </span>
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            <span className="truncate font-medium text-foreground">
                                                {p.metadata.name || id}
                                            </span>
                                            {caps.map((c) => (
                                                <span
                                                    key={c}
                                                    className="shrink-0 rounded-full bg-muted px-1.5 py-px text-[11px] text-muted-foreground"
                                                >
                                                    {capabilityLabel(c)}
                                                </span>
                                            ))}
                                        </div>
                                        <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                                            {p.metadata.description || "—"}
                                        </div>
                                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground/70">
                                            <span className="font-mono">{id}</span>
                                            <span>加载于 {formatDateTime(p.loaded_at)}</span>
                                        </div>
                                        {p.error && (
                                            <div className="mt-0.5 line-clamp-2 text-[11px] text-red-500">
                                                {p.error}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="text-xs tabular-nums text-muted-foreground">
                                    <span className="mr-1 sm:hidden">版本</span>
                                    {p.metadata.version || "—"}
                                </div>
                                <div className="truncate text-xs text-muted-foreground" title={p.metadata.author}>
                                    <span className="mr-1 sm:hidden">作者</span>
                                    {p.metadata.author || "—"}
                                </div>
                                <div>
                                    <span
                                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}
                                    >
                                        <span className={`size-1.5 rounded-full ${badge.dot}`} />
                                        {badge.label}
                                    </span>
                                </div>

                                <div className="flex items-center gap-1 sm:justify-end">
                                    {/* 重载：重启插件进程（二次确认） */}
                                    <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        aria-label="重载"
                                        title="重载"
                                        className={ACTION_TONE.neutral}
                                        onClick={() => setConfirm({ kind: "reload", plugin: p })}
                                    >
                                        <RotateCw className="size-4" />
                                    </Button>
                                    {/* 启用 / 停用：二选一（都走二次确认） */}
                                    {disabled ? (
                                        <Button
                                            variant="ghost"
                                            size="icon-sm"
                                            aria-label="启用"
                                            title="启用"
                                            className={ACTION_TONE.approve}
                                            onClick={() => setConfirm({ kind: "enable", plugin: p })}
                                        >
                                            <PlugZap className="size-4" />
                                        </Button>
                                    ) : (
                                        <Button
                                            variant="ghost"
                                            size="icon-sm"
                                            aria-label="停用"
                                            title="停用"
                                            className={ACTION_TONE.block}
                                            onClick={() => setConfirm({ kind: "disable", plugin: p })}
                                        >
                                            <Power className="size-4" />
                                        </Button>
                                    )}
                                    {/* 配置：schema 有就动态表单，没有就 JSON（二次确认在弹窗内保存时） */}
                                    <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        aria-label="配置"
                                        title="配置"
                                        className={ACTION_TONE.edit}
                                        onClick={() => setConfigPlugin(p)}
                                    >
                                        <Settings className="size-4" />
                                    </Button>
                                    {/* 卸载：不可撤销（二次确认） */}
                                    <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        aria-label="卸载"
                                        title="卸载"
                                        className={ACTION_TONE.delete}
                                        onClick={() => setConfirm({ kind: "uninstall", plugin: p })}
                                    >
                                        <Trash2 className="size-4" />
                                    </Button>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* 底部：固定在卡片底（后端列表接口无分页参数，这里只报数） */}
            <div className="flex shrink-0 items-center justify-between gap-3 border-t bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
                <span>
                    共 {plugins ? source.length : "—"} 个插件
                    <span className="ml-2 text-muted-foreground/70">
                        （接口无分页，筛选/搜索均为本地过滤）
                    </span>
                </span>
                <span className="text-muted-foreground/70">写操作均需二次确认</span>
            </div>

            {/* ===== 弹窗区 ===== */}
            {installOpen && (
                <InstallDialog onClose={() => setInstallOpen(false)} onDone={() => void load()} />
            )}

            {configPlugin && (
                <ConfigDialog
                    plugin={configPlugin}
                    onClose={() => setConfigPlugin(null)}
                    onSaved={() => void load()}
                />
            )}

            {confirm && (
                <ConfirmDialog
                    title={
                        confirm.kind === "uninstall"
                            ? "卸载插件"
                            : confirm.kind === "disable"
                              ? "停用插件"
                              : confirm.kind === "enable"
                                ? "启用插件"
                                : "重载插件"
                    }
                    confirmText={
                        confirm.kind === "uninstall"
                            ? "确认卸载"
                            : confirm.kind === "disable"
                              ? "确认停用"
                              : confirm.kind === "enable"
                                ? "确认启用"
                                : "确认重载"
                    }
                    danger={confirm.kind === "uninstall" || confirm.kind === "disable"}
                    busy={confirmBusy}
                    onCancel={() => setConfirm(null)}
                    onConfirm={() => void runConfirmedAction()}
                    message={
                        <>
                            <p>
                                插件：
                                <span className="font-medium text-foreground">
                                    {confirm.plugin.metadata.name || confirm.plugin.metadata.id}
                                </span>
                                <span className="ml-1 font-mono text-xs text-muted-foreground">
                                    {confirm.plugin.metadata.id}
                                </span>
                            </p>
                            <p className="text-xs">
                                {confirm.kind === "uninstall"
                                    ? "卸载会停止插件进程并删除插件目录，不可撤销。"
                                    : confirm.kind === "disable"
                                      ? "停用会立刻停掉插件进程，且停用状态会持久化（下次启动也不加载）。"
                                      : confirm.kind === "enable"
                                        ? "启用会立刻拉起插件进程；若二进制与服务器平台不匹配会报错。"
                                        : "重载会重启插件进程，期间它提供的搜索/事件能力短暂不可用。"}
                            </p>
                        </>
                    }
                />
            )}
        </div>
    );
}
