"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
    Eye,
    FileImage,
    Gauge,
    HardDrive,
    ImageOff,
    Images,
    RefreshCw,
    SlidersHorizontal,
    Trash2,
    Zap,
    type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { PaginationControls } from "@/components/pagination-controls";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { ACTION_TONE } from "@/lib/action-tones";

/* =============================================================================
 * 图片样式缓存页（静态外壳，接口未接入）
 *
 * 接口现状（探活结论）：
 *  - 「图片样式缓存」在远端**只有动作接口**，都在 thumbnail 资源下：
 *      · POST /thumbnail/regenerate                    —— 重新生成全部缩略图
 *      · POST /thumbnail/regenerate-directory          —— 按目录重新生成
 *      · POST /thumbnail/sign/{publicID}               —— 签发单张缩略图访问签名
 *    （这三个在 swagger 里能查到；另有 GET /thumbnail/styles 探活返回 401，
 *      说明资源存在、只是需要登录 —— 但它是「样式定义」，不是「缓存文件列表」。）
 *  - 也就是说：**没有列表 / 统计接口**，所以本页表格数据源（行数据）暂时待定，
 *    磁贴统计值也无处可取 → 统一先渲染 `—`。
 *  - 同源代理：本页所有动作都要在本仓库另建 `/api/admin/thumbnail/*` 路由转发
 *    （浏览器直连远端会跨域且拿不到 cookie），路由建好前不做任何请求。
 *
 * 因此本文件：**零网络请求**（不 import lib/api、不 fetch），筛选/搜索全用本地 state，
 * 行数据写成空数组常量并保留完整的行渲染；所有按钮统一 toast 占位。
 * ========================================================================== */

/** 表格行：字段按「缓存文件」这一语义预设，接口定下来后对齐字段名即可 */
type CacheRow = {
    id: number;
    /** 缓存文件路径（相对缓存根目录） */
    path: string;
    /** 原图尺寸，如 1920×1080 */
    source_size: string;
    /** 缩略图尺寸，如 640×360 */
    thumb_size: string;
    /** 输出格式：webp / avif / jpeg / png */
    format: string;
    /** 文件大小（字节，展示时格式化） */
    size: number;
    /** 生成时间（ISO 字符串） */
    created_at: string;
};

/**
 * 数据源占位：列表接口未定 → 先空数组。
 * 行渲染已按字段写好，接口接入后把结果塞进这里即可，不用改 JSX。
 */
const CACHE_ROWS: CacheRow[] = [];

/** 格式筛选（值用后端常见的 MIME 子类型短名） */
const FORMAT_OPTIONS = [
    { value: "webp", label: "WebP" },
    { value: "avif", label: "AVIF" },
    { value: "jpeg", label: "JPEG" },
    { value: "png", label: "PNG" },
];

/**
 * 目录筛选：目录清单同样只能来自「列表接口」，接口未定 → 先用缓存根下常见分组占位，
 * 接入后换成远端返回的目录数组即可。
 */
const DIR_OPTIONS = [
    { value: "posts", label: "/posts" },
    { value: "moments", label: "/moments" },
    { value: "avatars", label: "/avatars" },
];

/** 尺寸筛选：按缩略图长边（px）。缩略图配置来自 /thumbnail/styles，具体档位待确认 */
const SIZE_OPTIONS = [
    { value: "160", label: "160 px" },
    { value: "320", label: "320 px" },
    { value: "640", label: "640 px" },
    { value: "1280", label: "1280 px" },
];

/** 格式徽章配色（同一套色板，深浅色主题都可读） */
const FORMAT_CLASS: Record<string, string> = {
    webp: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    avif: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
    jpeg: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
    png: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
};

/** 字节 → 人类可读（接口未接入时恒为 0 → 展示 `—`） */
function formatBytes(n: number): string {
    if (!Number.isFinite(n) || n <= 0) return "—";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let value = n;
    let i = 0;
    while (value >= 1024 && i < units.length - 1) {
        value /= 1024;
        i += 1;
    }
    return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/** 时间戳（YYYY-MM-DD HH:MM，本地时区） */
function formatDateTime(iso?: string): string {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 统计磁贴：图标色块 + 标签 + 数值（数值待接口，统一渲染 `—`） */
function StatTile({
    icon: Icon,
    label,
    value,
    tone,
}: {
    icon: LucideIcon;
    label: string;
    value: string;
    tone: string;
}) {
    return (
        <div className="flex items-center gap-2.5 rounded-lg border bg-muted/40 px-3 py-2">
            <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${tone}`}>
                <Icon className="size-4" />
            </span>
            <div className="min-w-0">
                <p className="truncate text-xs text-muted-foreground">{label}</p>
                <p className="text-lg font-semibold tabular-nums text-muted-foreground/60">{value}</p>
            </div>
        </div>
    );
}

/**
 * 图片样式缓存：统计磁贴 + 当前缩略图配置 + 筛选工具栏 + 缓存文件列表（占位）。
 * 远端只有动作接口（regenerate / regenerate-directory / sign），没有列表接口，
 * 故列表数据源待定；页面不滚、表格卡片内滚、表头吸顶。
 */
export function ImageStyleCacheManager() {
    // 筛选全用本地 state（无请求）；"all" 代表「全部」
    const [dir, setDir] = useState("all");
    const [format, setFormat] = useState("all");
    const [size, setSize] = useState("all");

    /** 本地筛选（无请求）：接口接入后这里换成查询参数即可 */
    const rows = CACHE_ROWS.filter((row) => {
        if (dir !== "all" && !row.path.startsWith(`/${dir}`)) return false;
        if (format !== "all" && row.format !== format) return false;
        if (size !== "all" && !row.thumb_size.includes(size)) return false;
        return true;
    });

    const filtering = dir !== "all" || format !== "all" || size !== "all";

    // 移动端(<640px)：grid-cols-1 把每个单元格竖排成卡片；≥640px：恢复表格式列布局。
    // min-w 只写在 sm: 以上 —— 窄屏若也撑宽，卡片就会被拉出横向滚动。
    const rowGrid = "sm:grid-cols-[minmax(0,1fr)_104px_104px_72px_88px_144px_88px]";
    const rowMinW = "sm:min-w-[900px]";

    return (
        <div className="admin-card">
            {/* 统计磁贴：固定在卡片顶部（shrink-0），不随列表滚动 */}
            <div className="grid shrink-0 grid-cols-2 gap-2 border-b p-3 md:grid-cols-4">
                <StatTile
                    icon={Images}
                    label="缓存文件数"
                    value="—"
                    tone="bg-blue-500/10 text-blue-600 dark:text-blue-400"
                />
                <StatTile
                    icon={HardDrive}
                    label="占用空间"
                    value="—"
                    tone="bg-violet-500/10 text-violet-600 dark:text-violet-400"
                />
                <StatTile
                    icon={Zap}
                    label="命中率"
                    value="—"
                    tone="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                />
                <StatTile
                    icon={Gauge}
                    label="最近生成"
                    value="—"
                    tone="bg-amber-500/10 text-amber-600 dark:text-amber-400"
                />
            </div>

            {/* 当前缩略图配置：只读展示（来自 GET /thumbnail/styles，接口未接入 → `—`） */}
            <div className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-1.5 border-b bg-muted/20 px-4 py-2 text-xs">
                <span className="flex items-center gap-1.5 font-medium text-muted-foreground">
                    <SlidersHorizontal className="size-3.5" />
                    当前缩略图配置
                </span>
                <span className="text-muted-foreground">
                    格式
                    <span className="ml-1.5 font-medium tabular-nums text-muted-foreground/60">—</span>
                </span>
                <span className="text-muted-foreground">
                    尺寸
                    <span className="ml-1.5 font-medium tabular-nums text-muted-foreground/60">—</span>
                </span>
                <span className="text-muted-foreground">
                    质量
                    <span className="ml-1.5 font-medium tabular-nums text-muted-foreground/60">—</span>
                </span>
                <span className="ml-auto text-muted-foreground/70">
                    GET /thumbnail/styles 探活 401（接口存在，需登录），配置值待接入
                </span>
            </div>

            {/* 工具栏：固定在卡片顶部（shrink-0），不随下方列表滚动 */}
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b bg-muted/40 px-4 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                    {/* 目录筛选 */}
                    <Select value={dir} onValueChange={setDir}>
                        <SelectTrigger className="h-7 w-30 shrink-0 text-xs" aria-label="目录筛选">
                            <SelectValue placeholder="全部目录" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">全部目录</SelectItem>
                            {DIR_OPTIONS.map((o) => (
                                <SelectItem key={o.value} value={o.value}>
                                    {o.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    {/* 格式筛选 */}
                    <Select value={format} onValueChange={setFormat}>
                        <SelectTrigger className="h-7 w-26 shrink-0 text-xs" aria-label="格式筛选">
                            <SelectValue placeholder="全部格式" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">全部格式</SelectItem>
                            {FORMAT_OPTIONS.map((o) => (
                                <SelectItem key={o.value} value={o.value}>
                                    {o.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    {/* 尺寸筛选 */}
                    <Select value={size} onValueChange={setSize}>
                        <SelectTrigger className="h-7 w-26 shrink-0 text-xs" aria-label="尺寸筛选">
                            <SelectValue placeholder="全部尺寸" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">全部尺寸</SelectItem>
                            {SIZE_OPTIONS.map((o) => (
                                <SelectItem key={o.value} value={o.value}>
                                    {o.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <span className="text-xs text-muted-foreground">
                        共 <span className="font-medium text-foreground">{rows.length || "—"}</span> 个缓存文件
                    </span>
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        size="sm"
                        className="h-7 px-2 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
                        onClick={() => toast.info("重新生成缩略图待接入")}
                    >
                        <RefreshCw className="size-3.5" />
                        重新生成
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => toast.info("刷新待接入")}
                    >
                        <RefreshCw className="size-3.5" />
                        刷新
                    </Button>
                </div>
            </div>

            {/* 列表：卡片内唯一滚动区（表头吸顶），磁贴/配置条/工具栏/分页都不动 */}
            <div className="admin-scroll">
                {/* 表头：移动端隐藏（卡片自带行内信息即可读懂），≥sm 才以 grid 显示 */}
                <div
                    className={`admin-sticky-head hidden items-center gap-3 border-b px-4 py-2.5 text-xs font-medium text-muted-foreground sm:grid ${rowMinW} ${rowGrid}`}
                >
                    <span>文件路径</span>
                    <span>原图尺寸</span>
                    <span>缩略图尺寸</span>
                    <span className="text-center">格式</span>
                    <span>大小</span>
                    <span>生成时间</span>
                    <span className="text-right">操作</span>
                </div>

                {rows.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-1.5 py-12 text-sm text-muted-foreground">
                        <ImageOff className="size-5 opacity-60" />
                        <span>{filtering ? "没有匹配的缓存文件" : "暂无缓存文件列表"}</span>
                        <span className="text-xs text-muted-foreground/70">接口接入后显示</span>
                    </div>
                ) : (
                    rows.map((row) => (
                        <div
                            key={row.id}
                            className={`grid grid-cols-1 items-center gap-x-3 gap-y-2 border-b px-4 py-3 text-sm transition-colors last:border-b-0 hover:bg-muted/40 sm:gap-y-1 ${rowMinW} ${rowGrid}`}
                        >
                            <div className="flex items-start gap-2">
                                <FileImage className="mt-0.5 size-4 shrink-0 text-muted-foreground/60" />
                                <div className="min-w-0">
                                    <div className="truncate font-medium text-foreground" title={row.path}>
                                        {row.path || "—"}
                                    </div>
                                </div>
                            </div>
                            <div className="text-xs tabular-nums text-muted-foreground">
                                <span className="mr-1 sm:hidden">原图</span>
                                {row.source_size || "—"}
                            </div>
                            <div className="text-xs tabular-nums text-muted-foreground">
                                <span className="mr-1 sm:hidden">缩略图</span>
                                {row.thumb_size || "—"}
                            </div>
                            <div className="sm:text-center">
                                <span
                                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${FORMAT_CLASS[row.format] || "bg-muted text-muted-foreground"}`}
                                >
                                    {row.format || "—"}
                                </span>
                            </div>
                            <div className="text-xs tabular-nums text-muted-foreground">
                                {/* 裸字节数脱离表头看不懂，窄屏补个前缀 */}
                                <span className="mr-1 sm:hidden">大小</span>
                                {formatBytes(row.size)}
                            </div>
                            <div className="text-xs text-muted-foreground">{formatDateTime(row.created_at)}</div>
                            <div className="flex items-center gap-1 sm:justify-end">
                                <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label="查看"
                                    title="查看"
                                    className={ACTION_TONE.view}
                                    onClick={() => toast.info("查看待接入")}
                                >
                                    <Eye className="size-4" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label="删除缓存"
                                    title="删除缓存"
                                    className={ACTION_TONE.delete}
                                    onClick={() => toast.info("删除缓存待接入")}
                                >
                                    <Trash2 className="size-4" />
                                </Button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* 分页：固定在卡片底部（接口未接入 → 禁用），不随列表滚动 */}
            <div className="flex shrink-0 items-center justify-between gap-3 border-t bg-muted/40 px-4 py-2.5 text-xs text-muted-foreground">
                <span>第 1 / 1 页</span>
                <PaginationControls
                    page={1}
                    totalPages={1}
                    onPageChange={() => toast.info("分页待接入")}
                    disabled
                />
            </div>
        </div>
    );
}
