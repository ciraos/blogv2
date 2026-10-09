"use client";

/**
 * 图片样式缓存（已接真后端）。
 *
 * ==== 数据来源 ====
 * 1) 存储策略图片样式（权威证据：后端源码，不是猜测）
 *    - 路由 internal/infra/router/router.go:528-535：/policies 组（JWTAuth + AdminAuth）下
 *      GET /policies/:id/image-styles、PUT /policies/:id/image-styles。
 *    - handler pkg/handler/storage_policy/image_styles.go:22,43：请求/响应同为
 *      { image_process, image_styles }，PUT 是**整体替换**并由后端 ValidateConfig /
 *      ValidateAutoCompressPolicy 做权威校验。
 *    - 字段定义 pkg/domain/model/image_style.go（ImageProcessConfig / ImageStyleConfig /
 *      ImageResizeConfig / AutoCompressConfig / WatermarkConfig）。
 *    - 线上只读探活：GET /api/policies/1/image-styles → 401（路由存在、仅需鉴权）。
 *    本仓库代理：GET|PUT /api/admin/image-styles/{id}。
 * 2) 策略列表：复用已有的 /api/admin/storage-policies（src/lib/api.ts 的
 *    getAdminStoragePoliciesApi），返回 { list, total }。
 * 3) 缓存统计：复用已有的 GET /api/admin/cache/status（src/lib/api-cache.ts 的
 *    getCacheStatusApi），其中的 image.stats 就是 image_style.DiskCache 的 CacheStats
 *    （源码 cmd/server/cache_management.go:41-48 用 Stats(ctx, 0)，所以是**全部策略合计**）。
 * 4) 缓存操作：清理复用现有的 POST /api/admin/cache/manage（type=image，
 *    cache_management.go:64-70 的 "image" action）；重新生成走本页新增代理
 *    /api/admin/image-styles/{regenerate,regenerate-directory} → 远端
 *    POST /thumbnail/regenerate{,/directory}（router.go:397-405）。
 *
 * ==== 为什么这里没有「缓存文件列表」 ====
 * 后端 DiskCache 只提供 Stats / Purge（pkg/service/image_style/cache.go:281,321），
 * 没有「按目录/格式/尺寸枚举缓存条目」的接口。上一版占位页那套表格行数据无处可取，
 * 本轮直接删掉假表格，改为「策略样式编辑 + 缓存统计 + 缓存操作」三段真实内容。
 *
 * 所有写操作（PUT 保存、清理缓存、重新生成）都带二次确认。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
    Gauge,
    HardDrive,
    ImageOff,
    Images,
    Layers,
    Plus,
    RefreshCw,
    Save,
    Trash2,
    Wand2,
    Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { getAdminStoragePoliciesApi } from "@/lib/api";
import { getCacheStatusApi, manageCacheApi, type CacheStatus } from "@/lib/api-cache";
import type { StoragePolicy } from "@/types/storage-policy";

/* =============================================================================
 * 远端 DTO（一一对应 pkg/domain/model/image_style.go，字段名按 json tag 原样抄）
 * ========================================================================== */

/** 输出格式枚举（model.ImageStyleConfig.Format：original / webp / avif / png / jpg / heic） */
const FORMAT_OPTIONS = ["original", "webp", "avif", "png", "jpg", "heic"] as const;

/** 缩放模式（model.ImageResizeConfig.Mode：cover / contain / fit-inside / scale） */
const RESIZE_MODE_OPTIONS = ["cover", "contain", "fit-inside", "scale"] as const;

/** 水印位置（model.WatermarkConfig.Position） */
const POSITION_OPTIONS = ["top-left", "top-right", "bottom-left", "bottom-right", "center", "tile"] as const;

/** 启用 image_process 但未指定扩展名时，后端会补这组默认值（model.DefaultImageProcessApplyExtensions） */
const DEFAULT_APPLY_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "heic"];

interface AutoCompressConfig {
    enabled: boolean;
    quality?: number;
    max_width?: number;
    max_height?: number;
    /** original / webp / avif / png / jpg / heic；空串视为 original */
    format?: string;
    /** true=按 EXIF 自动旋转；nil=后端默认 true */
    auto_rotate?: boolean;
}

interface ImageProcessConfig {
    enabled: boolean;
    /** 命中处理的扩展名（不含点、小写） */
    apply_to_extensions: string[];
    /** 上传返回 URL 时自动拼接的样式名；空串表示不拼 */
    default_style: string;
    /** 云策略不接受该字段（后端会置空并对云策略校验） */
    auto_compress?: AutoCompressConfig;
}

interface ImageResizeConfig {
    mode: string;
    width?: number;
    height?: number;
    scale?: number;
    enlarge?: boolean;
}

interface WatermarkConfig {
    type: string;
    text?: string;
    image_url?: string;
    position?: string;
    offset_x?: number;
    offset_y?: number;
    opacity?: number;
    font_size?: number;
    color?: string;
    font_family?: string;
}

interface ImageStyleConfig {
    name: string;
    format?: string;
    quality?: number;
    auto_rotate: boolean;
    resize: ImageResizeConfig;
    watermark?: WatermarkConfig;
}

/** GET/PUT /policies/:id/image-styles 的请求与响应体（同构） */
interface PolicyImageStylesPayload {
    image_process: ImageProcessConfig;
    image_styles: ImageStyleConfig[];
}

/** 新建样式时的模板（resize 在后端是必填，给一个能过校验的最小值） */
function emptyStyle(): ImageStyleConfig {
    return {
        name: "",
        format: "webp",
        quality: 80,
        auto_rotate: true,
        resize: { mode: "fit-inside", width: 1280, enlarge: false },
    };
}

/* =============================================================================
 * 同源 fetch 助手
 * 为什么另写一个：src/lib/api.ts 的 request 未导出，而这里只需要打本站同源代理
 * /api/admin/image-styles/*（同目录 route.ts 读 httpOnly cookie 带 Bearer 转发）。
 * 写法与 src/lib/api-cache.ts 完全一致，避免同一仓库两套解包规则。
 * ========================================================================== */

class ImageStylesApiError extends Error {
    status: number;
    code: number;

    constructor(message: string, status: number, code: number) {
        super(message);
        this.name = "ImageStylesApiError";
        this.status = status;
        this.code = code;
    }
}

interface ProxyEnvelope<T> {
    code: number;
    message: string;
    data: T;
}

async function fetchImageStylesApi<T>(path: string, init?: RequestInit): Promise<T> {
    const headers = new Headers(init?.headers);
    if (init?.body && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
    }

    let res: Response;
    try {
        res = await fetch(path, { ...init, headers, cache: "no-store" });
    } catch {
        throw new ImageStylesApiError("网络请求失败，请检查网络连接", 0, 0);
    }

    let json: ProxyEnvelope<T> | null = null;
    try {
        json = (await res.json()) as ProxyEnvelope<T>;
    } catch {
        // 非 JSON 响应 → 下面按 HTTP 状态报错
    }

    if (res.ok && json && (json.code === 200 || json.code === 0)) {
        return json.data;
    }
    throw new ImageStylesApiError(
        json?.message || `请求失败（HTTP ${res.status}）`,
        res.status,
        json?.code ?? res.status
    );
}

/** GET /api/admin/image-styles/:id —— 读取该策略的 image_process + image_styles */
function getPolicyImageStylesApi(id: number): Promise<PolicyImageStylesPayload> {
    return fetchImageStylesApi<PolicyImageStylesPayload>(`/api/admin/image-styles/${id}`, { method: "GET" });
}

/** PUT /api/admin/image-styles/:id —— 整体替换（后端做权威校验） */
async function putPolicyImageStylesApi(id: number, payload: PolicyImageStylesPayload): Promise<void> {
    await fetchImageStylesApi<unknown>(`/api/admin/image-styles/${id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
    });
}

/** POST /api/admin/image-styles/regenerate —— 单文件重新生成缩略图（body 的文件 publicID） */
async function regenerateThumbnailApi(publicID: string): Promise<void> {
    await fetchImageStylesApi<unknown>("/api/admin/image-styles/regenerate", {
        method: "POST",
        body: JSON.stringify({ id: publicID }),
    });
}

/** POST /api/admin/image-styles/regenerate-directory —— 按目录批量重新生成（目录 publicID） */
async function regenerateDirectoryApi(directoryID: string): Promise<void> {
    await fetchImageStylesApi<unknown>("/api/admin/image-styles/regenerate-directory", {
        method: "POST",
        body: JSON.stringify({ directoryId: directoryID }),
    });
}

/* =============================================================================
 * 展示辅助
 * ========================================================================== */

/** 字节 → 人类可读 */
function formatBytes(n?: number): string {
    if (n === undefined || !Number.isFinite(n) || n <= 0) return "—";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let value = n;
    let i = 0;
    while (value >= 1024 && i < units.length - 1) {
        value /= 1024;
        i += 1;
    }
    return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function errorMessage(error: unknown, fallback: string): string {
    if (error instanceof ImageStylesApiError) return error.message;
    if (error instanceof Error) return error.message;
    return fallback;
}

/** 统计磁贴 */
function StatTile({
    icon: Icon,
    label,
    value,
    chip,
    hint,
}: {
    icon: typeof Images;
    label: string;
    value: string;
    chip: string;
    hint?: string;
}) {
    return (
        <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2">
            <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${chip}`}>
                <Icon className="size-4" />
            </span>
            <div className="min-w-0">
                <p className="truncate text-xs text-muted-foreground">{label}</p>
                <p className="truncate text-lg font-semibold tabular-nums text-foreground" title={value}>
                    {value}
                </p>
                {hint && <p className="truncate text-[11px] text-muted-foreground/70">{hint}</p>}
            </div>
        </div>
    );
}

/** 表单小控件：数字输入（空串 = 不传该字段，保持 omitempty 语义） */
function NumberField({
    label,
    value,
    onChange,
    min,
    max,
    step,
    disabled,
    className,
}: {
    label: string;
    value?: number;
    onChange: (value: number | undefined) => void;
    min?: number;
    max?: number;
    step?: number;
    disabled?: boolean;
    className?: string;
}) {
    return (
        <label className={`space-y-1 ${className ?? ""}`}>
            <span className="block text-xs text-muted-foreground">{label}</span>
            <Input
                type="number"
                value={value ?? ""}
                min={min}
                max={max}
                step={step}
                disabled={disabled}
                onChange={(e) => {
                    const raw = e.target.value;
                    onChange(raw === "" ? undefined : Number(raw));
                }}
                className="h-8 text-xs"
            />
        </label>
    );
}

/** 表单小控件：下拉 */
function EnumField({
    label,
    value,
    options,
    onChange,
    disabled,
    className,
}: {
    label: string;
    value: string;
    options: readonly string[];
    onChange: (value: string) => void;
    disabled?: boolean;
    className?: string;
}) {
    return (
        <div className={`space-y-1 ${className ?? ""}`}>
            <span className="block text-xs text-muted-foreground">{label}</span>
            <Select value={value} onValueChange={onChange} disabled={disabled}>
                <SelectTrigger className="h-8 w-full text-xs" aria-label={label}>
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {options.map((option) => (
                        <SelectItem key={option} value={option}>
                            {option}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}

/* =============================================================================
 * 主组件
 * ========================================================================== */

export function ImageStylesManager() {
    const [policies, setPolicies] = useState<StoragePolicy[]>([]);
    const [policyId, setPolicyId] = useState<string>("");
    const [payload, setPayload] = useState<PolicyImageStylesPayload | null>(null);
    /** 载入时的原始 JSON：用来做脏检查，避免无改动也发 PUT */
    const [originalJson, setOriginalJson] = useState<string>("");

    const [loadingPolicies, setLoadingPolicies] = useState(true);
    const [loadingStyles, setLoadingStyles] = useState(false);
    const [stylesError, setStylesError] = useState<string | null>(null);
    const [busyAction, setBusyAction] = useState<string | null>(null);

    const [cacheStatus, setCacheStatus] = useState<CacheStatus | null>(null);
    const [cacheError, setCacheError] = useState<string | null>(null);

    const [filePublicID, setFilePublicID] = useState("");
    const [directoryPublicID, setDirectoryPublicID] = useState("");

    const busy = busyAction !== null;
    const selectedPolicy = useMemo(
        () => policies.find((p) => String(p.id) === policyId),
        [policies, policyId]
    );
    /** 云策略不接受 auto_compress（后端 ValidateAutoCompressPolicy 会拒） */
    const isLocalPolicy = selectedPolicy?.type === "local";
    const dirty = payload !== null && JSON.stringify(payload) !== originalJson;

    // ---- 拉取 ----

    const fetchCacheStatus = useCallback(async () => {
        try {
            const status = await getCacheStatusApi();
            setCacheStatus(status);
            setCacheError(status.image?.error ?? null);
        } catch (error) {
            setCacheError(errorMessage(error, "读取缓存统计失败"));
        }
    }, []);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const data = await getAdminStoragePoliciesApi();
                if (cancelled) return;
                const list = data.list ?? [];
                setPolicies(list);
                // 默认选中第一个策略：进页面就能看到内容，少一次点击
                const first = list.find((p) => typeof p.id === "number");
                if (first?.id !== undefined) setPolicyId(String(first.id));
            } catch (error) {
                if (!cancelled) toast.error(errorMessage(error, "获取存储策略失败"));
            } finally {
                if (!cancelled) setLoadingPolicies(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    // 延后到下一个 tick：effect 内同步 setState 会触发级联渲染（react-hooks/set-state-in-effect）
    useEffect(() => {
        const timer = setTimeout(() => void fetchCacheStatus(), 0);
        return () => clearTimeout(timer);
    }, [fetchCacheStatus]);

    const fetchImageStyles = useCallback(async (id: number) => {
        setLoadingStyles(true);
        setStylesError(null);
        try {
            const data = await getPolicyImageStylesApi(id);
            // 兜底：后端理论不会返回 null，但 GET 在策略下无配置时可能给空数组
            const normalized: PolicyImageStylesPayload = {
                image_process: {
                    enabled: data.image_process?.enabled ?? false,
                    apply_to_extensions: data.image_process?.apply_to_extensions ?? [],
                    default_style: data.image_process?.default_style ?? "",
                    auto_compress: data.image_process?.auto_compress ?? undefined,
                },
                image_styles: (data.image_styles ?? []).map((style) => ({
                    ...style,
                    resize: style.resize ?? { mode: "fit-inside" },
                })),
            };
            setPayload(normalized);
            setOriginalJson(JSON.stringify(normalized));
        } catch (error) {
            setPayload(null);
            setOriginalJson("");
            setStylesError(errorMessage(error, "读取图片样式失败"));
        } finally {
            setLoadingStyles(false);
        }
    }, []);

    // 切策略时重置/加载：延后到下一个 tick，避免 effect 内同步 setState（react-hooks/set-state-in-effect）
    useEffect(() => {
        const timer = setTimeout(() => {
            if (!policyId) {
                setPayload(null);
                setOriginalJson("");
                return;
            }
            void fetchImageStyles(Number(policyId));
        }, 0);
        return () => clearTimeout(timer);
    }, [policyId, fetchImageStyles]);

    // ---- 编辑（全部是不可变更新，保存时整体 PUT） ----

    const updateProcess = (patch: Partial<ImageProcessConfig>) => {
        setPayload((prev) => (prev ? { ...prev, image_process: { ...prev.image_process, ...patch } } : prev));
    };

    const updateAutoCompress = (patch: Partial<AutoCompressConfig>) => {
        setPayload((prev) => {
            if (!prev) return prev;
            const base: AutoCompressConfig = prev.image_process.auto_compress ?? { enabled: false };
            return {
                ...prev,
                image_process: { ...prev.image_process, auto_compress: { ...base, ...patch } },
            };
        });
    };

    const updateStyle = (index: number, patch: Partial<ImageStyleConfig>) => {
        setPayload((prev) => {
            if (!prev) return prev;
            const next = [...prev.image_styles];
            next[index] = { ...next[index], ...patch };
            return { ...prev, image_styles: next };
        });
    };

    const updateResize = (index: number, patch: Partial<ImageResizeConfig>) => {
        setPayload((prev) => {
            if (!prev) return prev;
            const next = [...prev.image_styles];
            next[index] = { ...next[index], resize: { ...next[index].resize, ...patch } };
            return { ...prev, image_styles: next };
        });
    };

    /** patch 传 null = 移除水印（omitempty + 指针，nil 时不会出现 "watermark": null） */
    const updateWatermark = (index: number, patch: Partial<WatermarkConfig> | null) => {
        setPayload((prev) => {
            if (!prev) return prev;
            const next = [...prev.image_styles];
            const current = next[index].watermark;
            if (patch === null) {
                // 显式重建对象而不是 delete：保证"移除水印"后 JSON 里不出现 "watermark": null
                next[index] = {
                    name: next[index].name,
                    format: next[index].format,
                    quality: next[index].quality,
                    auto_rotate: next[index].auto_rotate,
                    resize: next[index].resize,
                };
            } else {
                next[index] = { ...next[index], watermark: { ...(current ?? { type: "text" }), ...patch } };
            }
            return { ...prev, image_styles: next };
        });
    };

    // ---- 写操作（都带二次确认） ----

    const handleSave = async () => {
        if (!payload || !selectedPolicy?.id) return;

        // 客户端只做「明显错误」的即时提示，权威校验仍在后端（ValidateConfig）：
        // 详见 pkg/service/image_style/config_validation.go，这里不复制它的规则集。
        const names = payload.image_styles.map((s) => s.name.trim());
        if (payload.image_styles.some((s) => !/^[a-zA-Z0-9_-]{1,32}$/.test(s.name.trim()))) {
            toast.error("样式名只能包含字母/数字/下划线/连字符，长度 1-32");
            return;
        }
        if (new Set(names).size !== names.length) {
            toast.error("样式名在同一策略内不能重复");
            return;
        }
        if (payload.image_process.default_style && !names.includes(payload.image_process.default_style)) {
            toast.error("默认样式必须是已存在的样式名（或留空）");
            return;
        }

        if (!window.confirm(`确定保存「${selectedPolicy.name ?? selectedPolicy.id}」的图片样式配置吗？该操作会整体替换原配置。`))
            return;

        setBusyAction("save");
        try {
            const body: PolicyImageStylesPayload = {
                image_process: {
                    enabled: payload.image_process.enabled,
                    apply_to_extensions: payload.image_process.apply_to_extensions
                        .map((ext) => ext.trim().replace(/^\./, "").toLowerCase())
                        .filter(Boolean),
                    default_style: payload.image_process.default_style,
                    // 云策略不传 auto_compress：后端会拒绝
                    auto_compress: isLocalPolicy ? payload.image_process.auto_compress : undefined,
                },
                image_styles: payload.image_styles.map((style) => ({
                    ...style,
                    name: style.name.trim(),
                })),
            };
            await putPolicyImageStylesApi(selectedPolicy.id, body);
            toast.success("图片样式配置已保存");
            await fetchImageStyles(selectedPolicy.id);
        } catch (error) {
            toast.error(errorMessage(error, "保存失败"));
        } finally {
            setBusyAction(null);
        }
    };

    const handlePurgeCache = async () => {
        if (!window.confirm("确定清理图片缓存吗？所有已生成的派生图都会被删除，下次访问会重新生成。")) return;
        setBusyAction("purge");
        try {
            await manageCacheApi("image");
            toast.success("图片缓存已清理");
            await fetchCacheStatus();
        } catch (error) {
            toast.error(errorMessage(error, "清理图片缓存失败"));
        } finally {
            setBusyAction(null);
        }
    };

    const handleRegenerate = async () => {
        const id = filePublicID.trim();
        if (!id) {
            toast.error("请填写文件公共ID");
            return;
        }
        if (!window.confirm(`确定重新生成文件「${id}」的缩略图吗？`)) return;
        setBusyAction("regenerate");
        try {
            await regenerateThumbnailApi(id);
            toast.success("已提交重新生成任务");
            setFilePublicID("");
            await fetchCacheStatus();
        } catch (error) {
            toast.error(errorMessage(error, "重新生成失败"));
        } finally {
            setBusyAction(null);
        }
    };

    const handleRegenerateDirectory = async () => {
        const id = directoryPublicID.trim();
        if (!id) {
            toast.error("请填写目录公共ID");
            return;
        }
        if (!window.confirm(`确定重新生成目录「${id}」下所有文件的缩略图吗？`)) return;
        setBusyAction("regenerate-directory");
        try {
            await regenerateDirectoryApi(id);
            toast.success("已提交目录批量重新生成任务");
            setDirectoryPublicID("");
            await fetchCacheStatus();
        } catch (error) {
            toast.error(errorMessage(error, "按目录重新生成失败"));
        } finally {
            setBusyAction(null);
        }
    };

    // ---- 缓存统计派生值 ----

    const imageStats = cacheStatus?.image?.stats;
    const imageAvailable = cacheStatus?.image?.available;
    // 命中率：后端 CacheStats 注明 Hit/Miss 是**进程级全局累计**，per-policy 计数当前恒为 0，
    // 所以优先用 policy_* 字段（非 0 时），否则退回全局字段，并在 UI 上标明口径。
    const hits = imageStats?.policy_hit_count || imageStats?.hit_count || 0;
    const misses = imageStats?.policy_miss_count || imageStats?.miss_count || 0;
    const hitRate = hits + misses > 0 ? `${((hits / (hits + misses)) * 100).toFixed(1)}%` : "—";

    return (
        <div className="admin-card">
            {/* 缓存统计磁贴 */}
            <div className="grid shrink-0 grid-cols-2 gap-2 border-b p-3 md:grid-cols-4">
                <StatTile
                    icon={Images}
                    label="缓存条目数（全部策略）"
                    value={imageStats?.count === undefined ? "—" : String(imageStats.count)}
                    chip="bg-blue-500/10 text-blue-600 dark:text-blue-400"
                />
                <StatTile
                    icon={HardDrive}
                    label="占用空间"
                    value={formatBytes(imageStats?.total_size)}
                    chip="bg-violet-500/10 text-violet-600 dark:text-violet-400"
                />
                <StatTile
                    icon={Zap}
                    label="命中率"
                    value={hitRate}
                    hint="进程累计口径"
                    chip="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                />
                <StatTile
                    icon={Gauge}
                    label="派生缓存可用性"
                    value={imageAvailable === undefined ? "—" : imageAvailable ? "可用" : "不可用"}
                    chip="bg-amber-500/10 text-amber-600 dark:text-amber-400"
                />
            </div>

            {/* 缓存统计来源提示 / 错误 */}
            <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b bg-muted/20 px-4 py-2 text-xs text-muted-foreground">
                <span>
                    统计来源 <span className="font-mono text-foreground">GET /api/admin/cache/status</span> 的
                    image.stats
                </span>
                {cacheError && <span className="text-red-600 dark:text-red-400">{cacheError}</span>}
                <Button
                    variant="outline"
                    size="sm"
                    className="ml-auto h-8 text-xs"
                    disabled={busy}
                    onClick={() => void fetchCacheStatus()}
                >
                    <RefreshCw className="size-3.5" />
                    刷新统计
                </Button>
            </div>

            {/* 主体：唯一滚动区 */}
            <div className="admin-scroll space-y-4 p-4">
                {/* 策略选择 */}
                <section className="space-y-2">
                    <div className="flex flex-wrap items-end gap-3">
                        <div className="space-y-1">
                            <Label className="text-xs">存储策略</Label>
                            <Select value={policyId} onValueChange={setPolicyId} disabled={loadingPolicies || busy}>
                                <SelectTrigger className="h-8 w-64 text-xs" aria-label="选择存储策略">
                                    <SelectValue placeholder={loadingPolicies ? "读取中…" : "请选择存储策略"} />
                                </SelectTrigger>
                                <SelectContent>
                                    {policies
                                        .filter((p) => typeof p.id === "number")
                                        .map((p) => (
                                            <SelectItem key={p.id} value={String(p.id)}>
                                                {p.name || `策略 #${p.id}`}（{p.type ?? "未知类型"}）
                                            </SelectItem>
                                        ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            接口 <span className="font-mono">GET|PUT /api/policies/{"{id}"}/image-styles</span>
                            {selectedPolicy?.type && (
                                <>
                                    ，当前策略类型 <span className="font-medium text-foreground">{selectedPolicy.type}</span>
                                    {!isLocalPolicy && "（云策略不使用本地自动压缩配置）"}
                                </>
                            )}
                        </p>
                    </div>
                </section>

                {loadingStyles && (
                    <div className="flex flex-col items-center justify-center gap-1.5 py-8 text-sm text-muted-foreground">
                        <RefreshCw className="size-5 animate-spin opacity-60" />
                        <span>正在读取样式配置…</span>
                    </div>
                )}

                {!loadingStyles && stylesError && (
                    <div className="flex flex-col items-center justify-center gap-1.5 py-8 text-sm text-muted-foreground">
                        <ImageOff className="size-5 opacity-60" />
                        <span className="text-red-600 dark:text-red-400">{stylesError}</span>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs"
                            onClick={() => policyId && void fetchImageStyles(Number(policyId))}
                        >
                            重试
                        </Button>
                    </div>
                )}

                {!loadingStyles && !stylesError && !payload && (
                    <div className="flex flex-col items-center justify-center gap-1.5 py-8 text-sm text-muted-foreground">
                        <ImageOff className="size-5 opacity-60" />
                        <span>请选择存储策略以查看图片样式配置</span>
                    </div>
                )}

                {!loadingStyles && payload && (
                    <>
                        {/* 图片处理总开关 */}
                        <section className="space-y-3 rounded-lg border p-3">
                            <header className="flex flex-wrap items-center gap-3">
                                <span className="flex items-center gap-1.5 text-sm font-medium">
                                    <Wand2 className="size-4 text-primary" />
                                    图片处理（image_process）
                                </span>
                                <label className="flex items-center gap-2 text-xs">
                                    <Checkbox
                                        checked={payload.image_process.enabled}
                                        onCheckedChange={(checked) => updateProcess({ enabled: checked === true })}
                                        aria-label="启用图片样式处理"
                                    />
                                    启用样式处理（关闭时样式请求 302 回原图）
                                </label>
                            </header>

                            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                                <label className="space-y-1 md:col-span-2">
                                    <span className="block text-xs text-muted-foreground">
                                        生效扩展名（不含点，逗号分隔；启用且留空时后端补默认值）
                                    </span>
                                    <Input
                                        value={payload.image_process.apply_to_extensions.join(",")}
                                        onChange={(e) =>
                                            updateProcess({
                                                apply_to_extensions: e.target.value
                                                    .split(",")
                                                    .map((ext) => ext.trim())
                                                    .filter(Boolean),
                                            })
                                        }
                                        placeholder={DEFAULT_APPLY_EXTENSIONS.join(",")}
                                        className="h-8 text-xs"
                                    />
                                </label>

                                <div className="space-y-1">
                                    <span className="block text-xs text-muted-foreground">
                                        默认样式（上传返回 URL 时拼接）
                                    </span>
                                    <Select
                                        value={payload.image_process.default_style || "__none__"}
                                        onValueChange={(v) => updateProcess({ default_style: v === "__none__" ? "" : v })}
                                    >
                                        <SelectTrigger className="h-8 w-full text-xs" aria-label="默认样式">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="__none__">不自动拼接</SelectItem>
                                            {payload.image_styles
                                                .filter((style) => style.name.trim() !== "")
                                                .map((style) => (
                                                    <SelectItem key={style.name} value={style.name}>
                                                        {style.name}
                                                    </SelectItem>
                                                ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            {/* 自动压缩：仅本地策略可编辑（后端对云策略会置空 + 校验拒收） */}
                            <div className="space-y-2 rounded-lg bg-muted/30 p-3">
                                <label className="flex items-center gap-2 text-xs">
                                    <Checkbox
                                        checked={payload.image_process.auto_compress?.enabled === true}
                                        disabled={!isLocalPolicy}
                                        onCheckedChange={(checked) =>
                                            updateAutoCompress({ enabled: checked === true })
                                        }
                                        aria-label="启用自动压缩"
                                    />
                                    自动压缩（auto_compress，仅对无样式命中的原图读取生效）
                                    {!isLocalPolicy && <span className="text-muted-foreground/70">— 云策略不可用</span>}
                                </label>
                                <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                                    <NumberField
                                        label="质量 quality"
                                        min={1}
                                        max={100}
                                        value={payload.image_process.auto_compress?.quality}
                                        disabled={!isLocalPolicy}
                                        onChange={(v) => updateAutoCompress({ quality: v })}
                                    />
                                    <NumberField
                                        label="最大宽"
                                        min={0}
                                        value={payload.image_process.auto_compress?.max_width}
                                        disabled={!isLocalPolicy}
                                        onChange={(v) => updateAutoCompress({ max_width: v })}
                                    />
                                    <NumberField
                                        label="最大高"
                                        min={0}
                                        value={payload.image_process.auto_compress?.max_height}
                                        disabled={!isLocalPolicy}
                                        onChange={(v) => updateAutoCompress({ max_height: v })}
                                    />
                                    <EnumField
                                        label="输出格式"
                                        value={payload.image_process.auto_compress?.format || "original"}
                                        options={FORMAT_OPTIONS}
                                        disabled={!isLocalPolicy}
                                        onChange={(v) => updateAutoCompress({ format: v })}
                                    />
                                    <div className="flex items-end">
                                        <label className="flex h-8 items-center gap-2 text-xs">
                                            <Checkbox
                                                checked={payload.image_process.auto_compress?.auto_rotate !== false}
                                                disabled={!isLocalPolicy}
                                                onCheckedChange={(checked) =>
                                                    updateAutoCompress({ auto_rotate: checked === true })
                                                }
                                                aria-label="按 EXIF 自动旋转"
                                            />
                                            EXIF 自动旋转
                                        </label>
                                    </div>
                                </div>
                            </div>
                        </section>

                        {/* 命名样式列表 */}
                        <section className="space-y-3">
                            <header className="flex flex-wrap items-center justify-between gap-2">
                                <span className="flex items-center gap-1.5 text-sm font-medium">
                                    <Layers className="size-4 text-primary" />
                                    命名样式（image_styles，共 {payload.image_styles.length} 条）
                                </span>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 text-xs"
                                    disabled={busy}
                                    onClick={() =>
                                        setPayload((prev) =>
                                            prev ? { ...prev, image_styles: [...prev.image_styles, emptyStyle()] } : prev
                                        )
                                    }
                                >
                                    <Plus className="size-3.5" />
                                    添加样式
                                </Button>
                            </header>

                            {payload.image_styles.length === 0 && (
                                <p className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
                                    该策略还没有命名样式。样式为空时，只有开启「自动压缩」才会处理原图。
                                </p>
                            )}

                            {payload.image_styles.map((style, index) => (
                                <div key={index} className="space-y-3 rounded-lg border p-3">
                                    <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                                        <label className="space-y-1">
                                            <span className="block text-xs text-muted-foreground">
                                                样式名（字母/数字/_/-，≤32）
                                            </span>
                                            <Input
                                                value={style.name}
                                                onChange={(e) => updateStyle(index, { name: e.target.value })}
                                                placeholder="thumbnail"
                                                className="h-8 font-mono text-xs"
                                            />
                                        </label>
                                        <EnumField
                                            label="输出格式"
                                            value={style.format || "original"}
                                            options={FORMAT_OPTIONS}
                                            onChange={(v) => updateStyle(index, { format: v })}
                                        />
                                        <NumberField
                                            label="质量 quality（0-100，0=最大压缩）"
                                            min={0}
                                            max={100}
                                            value={style.quality}
                                            onChange={(v) => updateStyle(index, { quality: v })}
                                        />
                                        <div className="flex items-end justify-between gap-2">
                                            <label className="flex h-8 items-center gap-2 text-xs">
                                                <Checkbox
                                                    checked={style.auto_rotate}
                                                    onCheckedChange={(checked) =>
                                                        updateStyle(index, { auto_rotate: checked === true })
                                                    }
                                                    aria-label="按 EXIF 自动旋转"
                                                />
                                                EXIF 自动旋转
                                            </label>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-8 text-xs text-red-600 dark:text-red-400"
                                                onClick={() =>
                                                    setPayload((prev) =>
                                                        prev
                                                            ? {
                                                                  ...prev,
                                                                  image_styles: prev.image_styles.filter(
                                                                      (_, i) => i !== index
                                                                  ),
                                                              }
                                                            : prev
                                                    )
                                                }
                                            >
                                                <Trash2 className="size-3.5" />
                                                移除
                                            </Button>
                                        </div>
                                    </div>

                                    {/* resize：后端必填子段 */}
                                    <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/30 p-3 md:grid-cols-5">
                                        <EnumField
                                            label="缩放模式 resize.mode"
                                            value={style.resize.mode}
                                            options={RESIZE_MODE_OPTIONS}
                                            onChange={(v) => updateResize(index, { mode: v })}
                                        />
                                        <NumberField
                                            label="宽 width"
                                            min={0}
                                            value={style.resize.width}
                                            onChange={(v) => updateResize(index, { width: v })}
                                        />
                                        <NumberField
                                            label="高 height"
                                            min={0}
                                            value={style.resize.height}
                                            onChange={(v) => updateResize(index, { height: v })}
                                        />
                                        <NumberField
                                            label="比例 scale（0.01-1，仅 scale 模式）"
                                            min={0.01}
                                            max={1}
                                            step={0.01}
                                            value={style.resize.scale}
                                            onChange={(v) => updateResize(index, { scale: v })}
                                        />
                                        <div className="flex items-end">
                                            <label className="flex h-8 items-center gap-2 text-xs">
                                                <Checkbox
                                                    checked={style.resize.enlarge === true}
                                                    onCheckedChange={(checked) =>
                                                        updateResize(index, { enlarge: checked === true })
                                                    }
                                                    aria-label="允许放大"
                                                />
                                                允许放大超过原图
                                            </label>
                                        </div>
                                    </div>

                                    {/* watermark：无 / 文字 / 图片；移除时整段删除（omitempty 语义） */}
                                    <div className="space-y-2 rounded-lg bg-muted/30 p-3">
                                        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                                            {/* 水印类型单独用 Select：三个选项要中文标签，EnumField 只回显原值 */}
                                            <div className="space-y-1">
                                                <span className="block text-xs text-muted-foreground">
                                                    水印类型 watermark.type
                                                </span>
                                                <Select
                                                    value={style.watermark?.type ?? "none"}
                                                    onValueChange={(v) =>
                                                        updateWatermark(index, v === "none" ? null : { type: v })
                                                    }
                                                >
                                                    <SelectTrigger className="h-8 w-full text-xs" aria-label="水印类型">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="none">无水印</SelectItem>
                                                        <SelectItem value="text">文字水印</SelectItem>
                                                        <SelectItem value="image">图片水印</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            {style.watermark?.type === "text" && (
                                                <label className="space-y-1 md:col-span-2">
                                                    <span className="block text-xs text-muted-foreground">水印文字</span>
                                                    <Input
                                                        value={style.watermark.text ?? ""}
                                                        onChange={(e) => updateWatermark(index, { text: e.target.value })}
                                                        className="h-8 text-xs"
                                                    />
                                                </label>
                                            )}
                                            {style.watermark?.type === "image" && (
                                                <label className="space-y-1 md:col-span-2">
                                                    <span className="block text-xs text-muted-foreground">
                                                        水印图片 URL
                                                    </span>
                                                    <Input
                                                        value={style.watermark.image_url ?? ""}
                                                        onChange={(e) =>
                                                            updateWatermark(index, { image_url: e.target.value })
                                                        }
                                                        className="h-8 text-xs"
                                                    />
                                                </label>
                                            )}
                                            {style.watermark && (
                                                <NumberField
                                                    label="透明度 0-1"
                                                    min={0}
                                                    max={1}
                                                    step={0.05}
                                                    value={style.watermark.opacity}
                                                    onChange={(v) => updateWatermark(index, { opacity: v })}
                                                />
                                            )}
                                        </div>
                                        {style.watermark && (
                                            <EnumField
                                                label="位置 watermark.position"
                                                value={style.watermark.position ?? "bottom-right"}
                                                options={POSITION_OPTIONS}
                                                onChange={(v) => updateWatermark(index, { position: v })}
                                                className="md:w-1/4"
                                            />
                                        )}
                                    </div>
                                </div>
                            ))}
                        </section>

                        {/* 缓存操作 */}
                        <section className="space-y-3 rounded-lg border p-3">
                            <span className="flex items-center gap-1.5 text-sm font-medium">
                                <Trash2 className="size-4 text-primary" />
                                缓存操作
                            </span>
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                                <div className="space-y-1">
                                    <span className="block text-xs text-muted-foreground">
                                        文件公共ID（重新生成单张缩略图）
                                    </span>
                                    <div className="flex gap-2">
                                        <Input
                                            value={filePublicID}
                                            onChange={(e) => setFilePublicID(e.target.value)}
                                            placeholder="文件 publicID"
                                            className="h-8 font-mono text-xs"
                                        />
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-8 shrink-0 text-xs"
                                            disabled={busy}
                                            onClick={handleRegenerate}
                                        >
                                            <RefreshCw className="size-3.5" />
                                            重新生成
                                        </Button>
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <span className="block text-xs text-muted-foreground">
                                        目录公共ID（按目录批量重新生成）
                                    </span>
                                    <div className="flex gap-2">
                                        <Input
                                            value={directoryPublicID}
                                            onChange={(e) => setDirectoryPublicID(e.target.value)}
                                            placeholder="目录 publicID"
                                            className="h-8 font-mono text-xs"
                                        />
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-8 shrink-0 text-xs"
                                            disabled={busy}
                                            onClick={handleRegenerateDirectory}
                                        >
                                            <RefreshCw className="size-3.5" />
                                            批量重新生成
                                        </Button>
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <span className="block text-xs text-muted-foreground">
                                        清理图片缓存（POST /api/admin/cache/manage type=image）
                                    </span>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-8 text-xs text-red-600 dark:text-red-400"
                                        disabled={busy}
                                        onClick={handlePurgeCache}
                                    >
                                        <Trash2 className="size-3.5" />
                                        清理图片缓存
                                    </Button>
                                </div>
                            </div>
                        </section>
                    </>
                )}
            </div>

            {/* 底部保存条 */}
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
                <span>
                    {payload
                        ? dirty
                            ? "配置已修改，尚未保存"
                            : "配置与服务端一致"
                        : "未选择策略"}
                </span>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        disabled={busy || !policyId || loadingStyles}
                        onClick={() => policyId && void fetchImageStyles(Number(policyId))}
                    >
                        <RefreshCw className="size-3.5" />
                        重新载入
                    </Button>
                    <Button
                        size="sm"
                        className="h-8 text-xs"
                        disabled={busy || !dirty}
                        onClick={handleSave}
                    >
                        <Save className="size-3.5" />
                        保存样式
                    </Button>
                </div>
            </div>
        </div>
    );
}
