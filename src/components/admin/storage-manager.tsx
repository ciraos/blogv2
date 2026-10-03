"use client";

import { useEffect, useState } from "react";
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
import { getAdminStoragePoliciesApi } from "@/lib/api";
import { ACTION_TONE } from "@/lib/action-tones";
import { FLAG_OPTIONS, TYPE_OPTIONS, type StoragePolicy } from "@/types/storage-policy";

/**
 * 存储策略页 —— 读接口已接入（本轮只做「读」，增删改按钮仍是占位 toast）。
 *
 * 接口来源（官方 storage-policy.ts / swagger）：远端 `/storage-policies`
 *  - GET    /storage-policies                 列表（响应 { list, total }，⚠️ 无分页字段、无查询参数）
 *  - POST   /storage-policies                 新建
 *  - PUT    /storage-policies/{id}            更新
 *  - DELETE /storage-policies/{id}            删除
 *  - POST   /storage-policies/{id}/onedrive/connect  OneDrive 授权回调
 *  - GET    /storage-policies/onedrive/authorize     OneDrive 授权地址
 * 同源代理 `/api/admin/storage-policies`（见 src/app/api/admin/storage-policies/route.ts）。
 *
 * ⚠️ 已知问题：线上探活 `/storage-policies` 返回 404（不是 401），即当前后端**没有**这条远端路径，
 * 接入后大概率会报错。这里照原样实现（不改远端路径、不删代理），但做优雅降级：
 * 出错时 toast.error + 表格区可重试的错误态，绝不白屏 / 不崩。
 *
 * 由于列表接口没有分页参数，分页与筛选全部在本地完成（拿全量 list 后 slice / filter）。
 * 类型与中文标签常量统一从 `@/types/storage-policy` 引入，组件内不再重复声明。
 *
 * 外壳沿用后台列表页统一外壳：admin-card 内只有 admin-scroll 一个直系滚动子元素，
 * 加载 / 空 / 错误三态都渲染在同一个 admin-scroll 里。
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
function domainOf(item: StoragePolicy): string {
    return item.virtual_path || item.settings?.cdn_domain || item.base_path || "—";
}

/**
 * 存储策略页：统计磁贴 + 工具栏（新建 / 类型筛选 / 搜索 / 刷新）+ 列表 + 分页。
 * 外壳对齐打赏管理：页面不滚，磁贴 / 工具栏 / 分页固定在卡片上，只有列表区（admin-scroll）内部滚动。
 */
export function StorageManager() {
    /** 列表数据（远端 /storage-policies 全量返回） */
    const [list, setList] = useState<StoragePolicy[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    /** 错误信息：非空时列表区显示可重试的错误态（远端 404 走的就是这条路） */
    const [error, setError] = useState<string | null>(null);
    /** 本地筛选：类型 + 关键词（接口没有查询参数，全在前端过滤） */
    const [typeFilter, setTypeFilter] = useState<string>("all");
    const [keyword, setKeyword] = useState("");
    /** 本地分页页码（接口无分页字段，拿全量后在本地 slice） */
    const [page, setPage] = useState(1);
    /** 重试计数：变化即重新拉取 */
    const [refreshKey, setRefreshKey] = useState(0);

    // 拉取列表（浏览器自动携带登录 cookie）。延后到下一个 tick 再 setLoading，
    // 避免在 effect 内同步 setState 触发级联渲染（react-hooks/set-state-in-effect）。
    useEffect(() => {
        let cancelled = false;
        const timer = setTimeout(() => setLoading(true), 0);
        getAdminStoragePoliciesApi()
            .then((data) => {
                if (cancelled) return;
                const rows = data?.list ?? [];
                setList(rows);
                setTotal(data?.total ?? rows.length);
                setError(null);
            })
            .catch((e) => {
                if (cancelled) return;
                const msg = e instanceof Error ? e.message : "存储策略列表加载失败";
                // 出错（含远端 404）时清空列表：错误态独占列表区，不残留旧数据
                setList([]);
                setTotal(0);
                setError(msg);
                // toast 提示 + 表格区错误态（可重试），页面结构与外壳不受影响
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

    const kw = keyword.trim().toLowerCase();
    /** 本地筛选结果（类型 + 名称 / 域名 / 路径关键词） */
    const filtered = list.filter((item) => {
        if (typeFilter !== "all" && item.type !== typeFilter) return false;
        if (!kw) return true;
        const haystack = [item.name, domainOf(item), item.base_path, item.virtual_path, flagLabel(item.flag)]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
        return haystack.includes(kw);
    });

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

    /** 重试：错误态 / 手动重拉都靠这个计数触发 effect（筛选条件保留） */
    const retry = () => setRefreshKey((k) => k + 1);

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
                        共 <span className="font-medium text-foreground">{filtered.length}</span> 个存储策略
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

            {/* 列表：卡片内唯一滚动区（表头吸顶），工具栏与分页都不动。
                加载 / 空 / 错误三态都渲染在这个 admin-scroll 里，外壳保持不变 */}
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
                    <div aria-busy="true" aria-label="加载中">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <div
                                key={i}
                                className={`grid grid-cols-1 items-center gap-x-3 gap-y-2 border-b px-4 py-3 sm:gap-y-1 ${rowMinW} ${rowGrid}`}
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
                    // 错误态（远端 404 走这里）：消息 + 重试，页面不白屏
                    <div className="flex min-h-64 flex-col items-center justify-center gap-2 px-4 py-12 text-center">
                        <span className="flex size-12 items-center justify-center rounded-full border bg-destructive/10">
                            <Server className="size-5 text-destructive" />
                        </span>
                        <p className="text-sm font-medium text-destructive">存储策略加载失败</p>
                        <p className="max-w-md text-xs text-muted-foreground">{error}</p>
                        <p className="max-w-md text-xs text-muted-foreground/70">
                            远端 /storage-policies 在当前后端可能尚未开放（探活为 404），可稍后重试
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

            {/* 分页：固定在卡片底部，不随列表滚动。
                ⚠️ /storage-policies 无分页字段 → 这里是**本地分页**（全量 list 上 slice），不发分页参数 */}
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
        </div>
    );
}
