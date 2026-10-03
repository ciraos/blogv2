"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
    CircleCheck,
    CircleX,
    Globe,
    RefreshCw,
    RotateCcw,
    Send,
    TrendingUp,
    X,
    type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
 * SEO 推送页（静态外壳，接口未接入）
 *
 * 接口现状（探活结论）：**未找到推送资源**
 *  - GET /seo-push           → 404
 *  - GET /push               → 404
 *  - GET /pro/admin/seo-push → 404
 *  - swagger 里也没有该资源（既无推送记录列表，也无「立即推送 / 重试」端点）。
 *  - 因此本页字段全部**自定义**（见 PushRow）；各搜索引擎（百度 / 必应 / Google /
 *    IndexNow）的推送接口要不要经后端中转、密钥怎么存，都待后端方案确定。
 *    同源代理路由（如 /api/admin/seo-push/*）需在本仓库另建，建好前不做任何请求。
 *
 * 因此本文件：**零网络请求**（不 import lib/api、不 fetch），筛选/搜索全用本地 state，
 * 行数据写成空数组常量并保留完整的行渲染；所有按钮统一 toast 占位。
 * ========================================================================== */

/** 表格行：后端无该资源 → 字段按「推送记录」语义自定义 */
type PushRow = {
    id: number;
    /** 推送时间（ISO 字符串） */
    pushed_at: string;
    /** 搜索引擎：baidu / bing / google / indexnow */
    engine: string;
    /** 推送类型：url（URL 推送）/ sitemap（站点地图） */
    kind: string;
    /** 被推送的 URL（站点地图类型为空） */
    url: string;
    /** 推送结果：success / failed */
    status: string;
    /** 引擎返回信息（成功条数 / 报错文本） */
    message: string;
};

/**
 * 数据源占位：推送接口不存在 → 先空数组。
 * 行渲染已按字段写好，接口接入后把结果塞进这里即可，不用改 JSX。
 */
const PUSH_ROWS: PushRow[] = [];

/** 搜索引擎筛选 */
const ENGINE_OPTIONS = [
    { value: "baidu", label: "百度" },
    { value: "bing", label: "必应" },
    { value: "google", label: "Google" },
    { value: "indexnow", label: "IndexNow" },
];

/** 推送类型筛选 */
const KIND_OPTIONS = [
    { value: "url", label: "URL 推送" },
    { value: "sitemap", label: "站点地图" },
];

/** 搜索引擎徽章配色 */
const ENGINE_CLASS: Record<string, string> = {
    baidu: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    bing: "bg-teal-500/15 text-teal-600 dark:text-teal-400",
    google: "bg-red-500/15 text-red-600 dark:text-red-400",
    indexnow: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
};

const ENGINE_LABEL: Record<string, string> = {
    baidu: "百度",
    bing: "必应",
    google: "Google",
    indexnow: "IndexNow",
};

const KIND_LABEL: Record<string, string> = {
    url: "URL 推送",
    sitemap: "站点地图",
};

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
 * SEO 推送：统计磁贴 + 引擎/类型筛选 + URL 搜索 + 推送记录列表（占位）。
 * 远端无推送资源（/seo-push、/push、/pro/admin/seo-push 探活 404，swagger 无），字段自定义；
 * 页面不滚、表格卡片内滚、表头吸顶。
 */
export function SeoPushManager() {
    // 筛选/搜索全用本地 state（无请求）
    const [engine, setEngine] = useState("all");
    const [kind, setKind] = useState("all");
    const [input, setInput] = useState("");
    const [keyword, setKeyword] = useState("");

    /** 本地筛选（无请求）：接口接入后换成查询参数即可 */
    const rows = PUSH_ROWS.filter((row) => {
        if (engine !== "all" && row.engine !== engine) return false;
        if (kind !== "all" && row.kind !== kind) return false;
        const kw = keyword.trim().toLowerCase();
        if (kw && !row.url.toLowerCase().includes(kw) && !row.message.toLowerCase().includes(kw)) return false;
        return true;
    });

    const filtering = engine !== "all" || kind !== "all" || Boolean(keyword.trim());

    // 移动端(<640px)：grid-cols-1 把每个单元格竖排成卡片；≥640px：恢复表格式列布局。
    // min-w 只写在 sm: 以上 —— 窄屏若也撑宽，卡片就会被拉出横向滚动。
    const rowGrid =
        "sm:grid-cols-[140px_92px_100px_minmax(0,1.4fr)_76px_minmax(0,1fr)_64px]";
    const rowMinW = "sm:min-w-[1000px]";

    return (
        <div className="admin-card">
            {/* 统计磁贴：固定在卡片顶部（shrink-0），不随列表滚动 */}
            <div className="grid shrink-0 grid-cols-2 gap-2 border-b p-3 md:grid-cols-4">
                <StatTile
                    icon={Send}
                    label="今日推送"
                    value="—"
                    tone="bg-blue-500/10 text-blue-600 dark:text-blue-400"
                />
                <StatTile
                    icon={CircleCheck}
                    label="成功"
                    value="—"
                    tone="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                />
                <StatTile
                    icon={CircleX}
                    label="失败"
                    value="—"
                    tone="bg-red-500/10 text-red-600 dark:text-red-400"
                />
                <StatTile
                    icon={TrendingUp}
                    label="已收录"
                    value="—"
                    tone="bg-violet-500/10 text-violet-600 dark:text-violet-400"
                />
            </div>

            {/* 工具栏：固定在卡片顶部（shrink-0），不随下方列表滚动 */}
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b bg-muted/40 px-4 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                    {/* 搜索引擎筛选 */}
                    <Select value={engine} onValueChange={setEngine}>
                        <SelectTrigger className="h-7 w-26 shrink-0 text-xs" aria-label="搜索引擎筛选">
                            <SelectValue placeholder="全部引擎" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">全部引擎</SelectItem>
                            {ENGINE_OPTIONS.map((o) => (
                                <SelectItem key={o.value} value={o.value}>
                                    {o.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    {/* 推送类型筛选 */}
                    <Select value={kind} onValueChange={setKind}>
                        <SelectTrigger className="h-7 w-28 shrink-0 text-xs" aria-label="推送类型筛选">
                            <SelectValue placeholder="全部类型" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">全部类型</SelectItem>
                            {KIND_OPTIONS.map((o) => (
                                <SelectItem key={o.value} value={o.value}>
                                    {o.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    {/* URL 搜索：输入即筛（本地 state，无请求） */}
                    <div className="relative w-52">
                        <Input
                            value={input}
                            onChange={(e) => {
                                setInput(e.target.value);
                                setKeyword(e.target.value);
                            }}
                            placeholder="搜索 URL 或返回信息"
                            className="h-7 pr-7 text-xs"
                            aria-label="搜索推送记录"
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

                    <span className="text-xs text-muted-foreground">
                        共 <span className="font-medium text-foreground">{rows.length || "—"}</span> 条推送记录
                    </span>
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        size="sm"
                        className="h-7 px-2 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
                        onClick={() => toast.info("立即推送待接入")}
                    >
                        <Send className="size-3.5" />
                        立即推送
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

            {/* 列表：卡片内唯一滚动区（表头吸顶），磁贴/工具栏/分页都不动 */}
            <div className="admin-scroll">
                {/* 表头：移动端隐藏（卡片自带行内信息即可读懂），≥sm 才以 grid 显示 */}
                <div
                    className={`admin-sticky-head hidden items-center gap-3 border-b px-4 py-2.5 text-xs font-medium text-muted-foreground sm:grid ${rowMinW} ${rowGrid}`}
                >
                    <span>时间</span>
                    <span>搜索引擎</span>
                    <span>推送类型</span>
                    <span>URL</span>
                    <span className="text-center">状态</span>
                    <span>返回信息</span>
                    <span className="text-right">操作</span>
                </div>

                {rows.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-1.5 py-12 text-sm text-muted-foreground">
                        <Globe className="size-5 opacity-60" />
                        <span>{filtering ? "没有匹配的推送记录" : "暂无推送记录"}</span>
                        <span className="text-xs text-muted-foreground/70">接口接入后显示</span>
                    </div>
                ) : (
                    rows.map((row) => {
                        const ok = row.status === "success";
                        return (
                            <div
                                key={row.id}
                                className={`grid grid-cols-1 items-center gap-x-3 gap-y-2 border-b px-4 py-3 text-sm transition-colors last:border-b-0 hover:bg-muted/40 sm:gap-y-1 ${rowMinW} ${rowGrid}`}
                            >
                                <div className="text-xs text-muted-foreground">
                                    {formatDateTime(row.pushed_at)}
                                </div>
                                <div>
                                    <span
                                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${ENGINE_CLASS[row.engine] || "bg-muted text-muted-foreground"}`}
                                    >
                                        {ENGINE_LABEL[row.engine] || row.engine || "—"}
                                    </span>
                                </div>
                                <div className="text-xs text-muted-foreground">
                                    {KIND_LABEL[row.kind] || row.kind || "—"}
                                </div>
                                <div className="min-w-0">
                                    <div className="truncate text-xs text-foreground/80" title={row.url}>
                                        {row.url || "—"}
                                    </div>
                                </div>
                                <div className="sm:text-center">
                                    <span
                                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                                            ok
                                                ? "bg-green-500/15 text-green-600 dark:text-green-400"
                                                : "bg-red-500/15 text-red-600 dark:text-red-400"
                                        }`}
                                    >
                                        {ok ? "成功" : "失败"}
                                    </span>
                                </div>
                                <div className="min-w-0">
                                    <div className="line-clamp-1 text-xs text-muted-foreground" title={row.message}>
                                        {/* 引擎原文脱离表头不知是什么，窄屏补个前缀 */}
                                        <span className="mr-1 sm:hidden">返回</span>
                                        {row.message || "—"}
                                    </div>
                                </div>
                                <div className="flex items-center gap-1 sm:justify-end">
                                    <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        aria-label="重试"
                                        title="重试"
                                        className={ACTION_TONE.neutral}
                                        onClick={() => toast.info("重试推送待接入")}
                                    >
                                        <RotateCcw className="size-4" />
                                    </Button>
                                </div>
                            </div>
                        );
                    })
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
