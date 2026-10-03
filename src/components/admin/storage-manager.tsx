"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Cloud, HardDrive, Pencil, Plus, RefreshCw, Search, Server, Star, Trash2 } from "lucide-react";

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

/**
 * 存储策略页 —— 纯静态外壳（接口先不接）。
 *
 * 接口来源（官方 storage-policy.ts / swagger）：远端 `/storage-policies`
 *  - GET    /storage-policies                 列表（响应 { list, total }，⚠️ 无分页字段）
 *  - POST   /storage-policies                 新建
 *  - PUT    /storage-policies/{id}            更新
 *  - DELETE /storage-policies/{id}            删除
 *  - POST   /storage-policies/{id}/onedrive/connect  OneDrive 授权回调
 *  - GET    /storage-policies/onedrive/authorize     OneDrive 授权地址
 * 同源代理需另建 `/api/admin/storage-policies`（本轮不接）。
 *
 * 本轮约定：不发起任何网络请求；按钮一律 toast.info("…待接入")；
 * 筛选 / 搜索 / 分页为本地 state；数据源是空数组常量，渲染逻辑按字段写好。
 */

const PAGE_SIZE = 10;

/** 官方 StoragePolicy.type → 中文标签 */
const TYPE_OPTIONS = [
    { value: "local", label: "本机存储" },
    { value: "onedrive", label: "OneDrive" },
    { value: "tencent_cos", label: "腾讯云 COS" },
    { value: "aliyun_oss", label: "阿里云 OSS" },
    { value: "aws_s3", label: "AWS S3" },
    { value: "qiniu_kodo", label: "七牛云存储" },
    { value: "upyun", label: "又拍云存储" },
] as const;

type StorageType = (typeof TYPE_OPTIONS)[number]["value"];

/** 官方 flag → 中文用途 */
const FLAG_OPTIONS = [
    { value: "article_image", label: "文章图片默认" },
    { value: "comment_image", label: "评论图片默认" },
    { value: "user_avatar", label: "用户头像默认" },
] as const;

/** 官方 StoragePolicy.settings 里本轮用到的字段 */
interface StoragePolicySettings {
    cdn_domain?: string;
}

/** 官方 StoragePolicy（字段名严格对齐） */
interface StoragePolicy {
    id?: number;
    name?: string;
    type?: StorageType | string;
    is_private?: boolean;
    max_size?: number;
    base_path?: string;
    virtual_path?: string;
    flag?: string;
    settings?: StoragePolicySettings;
    created_at?: string;
}

/** 数据源占位：接接口后由 GET /storage-policies 填充 */
const STORAGE_POLICIES: StoragePolicy[] = [];

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
function domainOf(item: StoragePolicy): string {
    return item.virtual_path || item.settings?.cdn_domain || item.base_path || "—";
}

/**
 * 存储策略页：统计磁贴 + 工具栏（新建 / 类型筛选 / 搜索 / 刷新）+ 列表 + 分页。
 * 外壳对齐打赏管理：页面不滚，磁贴 / 工具栏 / 分页固定在卡片上，只有列表区（admin-scroll）内部滚动。
 */
export function StorageManager() {
    /** 本地筛选（接口接入后作为请求参数） */
    const [typeFilter, setTypeFilter] = useState<string>("all");
    const [keyword, setKeyword] = useState("");
    const [page, setPage] = useState(1);

    const list = STORAGE_POLICIES;
    const total = STORAGE_POLICIES.length;
    const loading = false;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    /** 磁贴（接接口后由列表聚合） */
    const tiles = [
        { label: "策略数", value: "—", icon: Server },
        { label: "本机存储", value: "—", icon: HardDrive },
        { label: "云存储", value: "—", icon: Cloud },
        { label: "默认策略", value: "—", icon: Star },
    ];

    const hasFilter = typeFilter !== "all" || keyword.trim() !== "";

    // 移动端(<640px)：grid-cols-1 把每个单元格竖排成卡片；≥640px：恢复表格式列布局。
    // min-w 只写在 sm: 以上 —— 窄屏若也撑宽，卡片就会被拉出横向滚动。
    const rowGrid = "sm:grid-cols-[minmax(0,1fr)_104px_minmax(0,1.1fr)_88px_112px_56px_144px_104px]";
    const rowMinW = "sm:min-w-[1000px]";

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
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b bg-muted/40 px-4 py-2.5">
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        类型
                        <Select
                            value={typeFilter}
                            onValueChange={(v) => {
                                setTypeFilter(v);
                                setPage(1);
                            }}
                        >
                            <SelectTrigger className="h-7 w-max text-xs">
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
                        共 <span className="font-medium text-foreground">{total}</span> 个存储策略
                    </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={keyword}
                            onChange={(e) => {
                                setKeyword(e.target.value);
                                setPage(1);
                            }}
                            placeholder="搜索策略名称 / 域名…"
                            className="h-7 w-44 pl-8 text-xs sm:w-56"
                        />
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => toast.info("刷新存储策略待接入")}
                    >
                        <RefreshCw className="size-3.5" />
                        刷新
                    </Button>
                    <Button
                        size="sm"
                        className="h-7 px-2 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
                        onClick={() => toast.info("新建存储策略待接入")}
                    >
                        <Plus className="size-3.5" />
                        新建策略
                    </Button>
                </div>
            </div>

            {/* 列表：卡片内唯一滚动区（表头吸顶），工具栏与分页都不动 */}
            <div className="admin-scroll">
                {/* 表头：移动端隐藏（卡片自带行内信息即可读懂），≥sm 才以 grid 显示 */}
                <div
                    className={`admin-sticky-head hidden items-center gap-3 border-b px-4 py-2.5 text-xs font-medium text-muted-foreground sm:grid ${rowMinW} ${rowGrid}`}
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
                    <div className="py-12 text-center text-sm text-muted-foreground">加载中…</div>
                ) : list.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-1.5 py-12 text-sm text-muted-foreground">
                        <Server className="size-5 opacity-60" />
                        <span>{hasFilter ? "没有匹配的存储策略" : "暂无存储策略"}</span>
                        <span className="text-xs text-muted-foreground/70">接口接入后显示</span>
                    </div>
                ) : (
                    list.map((item, index) => (
                        <div
                            key={item.id ?? `${item.name}-${index}`}
                            className={`grid grid-cols-1 items-center gap-x-3 gap-y-2 border-b px-4 py-3 text-sm transition-colors last:border-b-0 hover:bg-muted/40 sm:gap-y-1 ${rowMinW} ${rowGrid}`}
                        >
                            <div className="min-w-0">
                                <div className="truncate font-medium text-foreground">{item.name || "—"}</div>
                                {item.base_path && (
                                    <div className="truncate text-xs text-muted-foreground">{item.base_path}</div>
                                )}
                            </div>
                            <div>
                                <span
                                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${typeBadgeCls(item.type)}`}
                                >
                                    {typeLabel(item.type)}
                                </span>
                            </div>
                            <div className="min-w-0 truncate text-xs text-muted-foreground">
                                <span className="mr-1 sm:hidden">域名</span>
                                {domainOf(item)}
                            </div>
                            <div className="text-xs tabular-nums text-muted-foreground">
                                <span className="mr-1 sm:hidden">最大文件</span>
                                {formatMaxSize(item.max_size)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                                <span className="mr-1 sm:hidden">用途</span>
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
                            <div className="text-xs tabular-nums text-muted-foreground">
                                {formatDateTime(item.created_at)}
                            </div>
                            <div className="flex items-center gap-1 sm:justify-end">
                                <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label="编辑"
                                    title="编辑"
                                    className={ACTION_TONE.edit}
                                    onClick={() => toast.info("编辑存储策略待接入")}
                                >
                                    <Pencil className="size-4" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label="设为默认"
                                    title="设为默认"
                                    className={ACTION_TONE.pin}
                                    onClick={() => toast.info("设为默认待接入")}
                                >
                                    <Star className="size-4" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label="删除"
                                    title="删除"
                                    className={ACTION_TONE.delete}
                                    onClick={() => toast.info("删除存储策略待接入")}
                                >
                                    <Trash2 className="size-4" />
                                </Button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* 分页：固定在卡片底部，不随列表滚动；⚠️ /storage-policies 无分页字段，接接口前保持禁用 */}
            <div className="flex shrink-0 items-center justify-between gap-3 border-t bg-muted/40 px-4 py-2.5 text-xs text-muted-foreground">
                <span>
                    第 {page} / {totalPages} 页
                    <span className="ml-2 text-muted-foreground/70">（接口接入后启用分页）</span>
                </span>
                <PaginationControls page={page} totalPages={totalPages} onPageChange={setPage} disabled />
            </div>
        </div>
    );
}
