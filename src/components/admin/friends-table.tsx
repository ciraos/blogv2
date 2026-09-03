"use client";
import { useEffect, useState } from "react";
import { ArrowDownAZ, ArrowUpAZ, ChevronLeft, ChevronRight, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { getAdminLinksApi } from "@/lib/api";
import { resolveAssetUrl } from "@/lib/utils";
import type { FriendLink } from "@/types/links";

/** 与 FriendsFilters 联动的筛选条件 */
export interface FriendsFilterState {
    keyword: string;
    status: string;
    category: string;
    tag: string;
}

const PAGE_SIZES = [10, 20, 50];

/** 状态 → 中文 + 色块（背景淡色 + 同色系文字） */
function statusBadge(status: string) {
    const s = (status || "").toUpperCase();
    if (s === "APPROVED" || s === "已通过") {
        return { label: "已通过", cls: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400" };
    }
    if (s === "PENDING" || s === "待审核") {
        return { label: "待审核", cls: "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-400" };
    }
    if (s === "REJECTED" || s === "已拒绝") {
        return { label: "已拒绝", cls: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400" };
    }
    return { label: status || "已失效", cls: "bg-muted text-muted-foreground" };
}

/** 友链头像（同友链界面）：有 logo 显示 logo，加载失败/占位/缺失时兜底为网站名称首字母 */
function LinkAvatarCell({ link }: { link: FriendLink }) {
    const [failed, setFailed] = useState(false);
    const logo = resolveAssetUrl(link.logo);
    // 数据里直接填了占位图（如 404_1.avif）的视为无头像
    const isPlaceholderLogo = !!logo && /404|placeholder|default/i.test(logo);

    if (!logo || failed || isPlaceholderLogo) {
        return (
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                {link.name?.slice(0, 1) || "?"}
            </div>
        );
    }
    return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
            src={logo}
            alt={link.name}
            loading="lazy"
            className="size-8 shrink-0 rounded-full border object-contain"
            onError={() => setFailed(true)}
        />
    );
}

/** 管理员友链表格：全选 + 网站信息/描述/分类标签/状态/操作 + 分页 */
export function FriendsTable({ filters }: { filters: FriendsFilterState }) {
    const [links, setLinks] = useState<FriendLink[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [jumpPage, setJumpPage] = useState("");
    // 网站名称排序：""（默认/后端顺序）→ "asc"（A→Z）→ "desc"（Z→A），点击循环切换
    const [nameSort, setNameSort] = useState<"" | "asc" | "desc">("");

    // 排序只作用于当前页已拉取的数据；刷新/翻页后回到后端顺序
    const sortedLinks = (() => {
        if (!nameSort || links.length === 0) return links;
        return [...links].sort((a, b) => {
            const na = (a.name || "").localeCompare(b.name || "", "zh-CN");
            return nameSort === "asc" ? na : -na;
        });
    })();

    // 筛选条件变化时回到第一页（setTimeout 规避 React Compiler 的 effect 内同步 setState 规则）
    useEffect(() => {
        const timer = setTimeout(() => setPage(1), 0);
        return () => clearTimeout(timer);
    }, [filters.keyword, filters.status, filters.category, filters.tag]);

    // 拉取友链列表（浏览器自动携带登录 cookie）
    useEffect(() => {
        let cancelled = false;
        const timer = setTimeout(() => setLoading(true), 0);
        getAdminLinksApi({
            page,
            pageSize,
            name: filters.keyword || undefined,
            status: filters.status || undefined,
            category_id: filters.category || undefined,
            tag_id: filters.tag || undefined,
        })
            .then((data) => {
                if (cancelled) return;
                setLinks(data.list ?? []);
                setTotal(data.total ?? 0);
                setSelected(new Set());
            })
            .catch(() => {
                if (!cancelled) toast.error("友链列表加载失败");
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
    }, [page, pageSize, filters.keyword, filters.status, filters.category, filters.tag]);

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const allChecked = links.length > 0 && selected.size === links.length;

    const toggleAll = () => {
        if (allChecked) {
            setSelected(new Set());
        } else {
            setSelected(new Set(links.map((l) => l.id)));
        }
    };
    const toggleOne = (id: number) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };
    const goPage = (p: number) => {
        if (p < 1 || p > totalPages) return;
        setPage(p);
        setJumpPage("");
    };
    const jump = () => {
        const p = parseInt(jumpPage, 10);
        if (!Number.isNaN(p)) goPage(p);
    };

    return (
        <div className="mt-4 overflow-hidden rounded-lg border bg-card shadow-sm">
            {/* 表头 */}
            <div className="flex items-center gap-3 bg-slate-50 border-b px-4 py-2.5 text-xs font-medium text-muted-foreground">
                <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={toggleAll}
                    aria-label="全选"
                    className="size-4 accent-primary"
                />
                <span className="flex flex-1 items-center gap-1">
                    网站信息
                    {/* 网站名称首字母排序：点击循环 默认 → A→Z → Z→A */}
                    <button
                        type="button"
                        onClick={() => setNameSort((v) => (v === "" ? "asc" : v === "asc" ? "desc" : ""))}
                        title={nameSort === "asc" ? "按名称升序（点击切为降序）" : nameSort === "desc" ? "按名称降序（点击取消排序）" : "按名称首字母排序"}
                        aria-label="按网站名称排序"
                        className={`flex size-6 items-center justify-center rounded transition-colors ${nameSort ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                            }`}
                    >
                        {nameSort === "asc" ? <ArrowDownAZ className="size-3.5" /> : nameSort === "desc" ? <ArrowUpAZ className="size-3.5" /> : <ArrowDownAZ className="size-3.5 opacity-60" />}
                    </button>
                </span>
                <span className="w-40 shrink-0 truncate">描述</span>
                <span className="w-28 shrink-0">分类 / 标签</span>
                <span className="w-20 shrink-0 text-center">状态</span>
                <span className="w-24 shrink-0 text-right">操作</span>
            </div>

            {/* 表体（可上下滚动） */}
            <div className="max-h-120 overflow-y-auto">
                {loading ? (
                    <div className="py-12 text-center text-sm text-muted-foreground">加载中…</div>
                ) : sortedLinks.length === 0 ? (
                    <div className="py-12 text-center text-sm text-muted-foreground">暂无友链</div>
                ) : (
                    sortedLinks.map((link) => {
                        const badge = statusBadge(link.status);
                        return (
                            <div
                                key={link.id}
                                className="flex items-center gap-3 border-b px-4 py-3 text-sm last:border-b-0 hover:bg-muted/40"
                            >
                                <input
                                    type="checkbox"
                                    checked={selected.has(link.id)}
                                    onChange={() => toggleOne(link.id)}
                                    aria-label={`选择 ${link.name}`}
                                    className="size-4 accent-primary"
                                />
                                {/* 网站信息 */}
                                <div className="flex flex-1 shrink-0 items-center gap-2.5">
                                    <LinkAvatarCell link={link} />
                                    <div className="min-w-0">
                                        <div className="truncate font-medium">{link.name}</div>
                                        {/* URL：可点击外链，鲜艳蓝色与文字区分（截断处 hover 可看全文） */}
                                        {link.url && (
                                            <a
                                                href={link.url.startsWith("http") ? link.url : `https://${link.url}`}
                                                target="_blank"
                                                rel="noopener noreferrer nofollow"
                                                title={link.url}
                                                onClick={(e) => e.stopPropagation()}
                                                className="block truncate text-xs/2.5 font-medium text-sky-500 transition-colors hover:text-sky-600 hover:underline dark:text-sky-400 dark:hover:text-sky-300"
                                            >
                                                {link.url}
                                            </a>
                                        )}
                                    </div>
                                </div>
                                {/* 描述 */}
                                <div className="w-40 shrink-0 truncate text-xs text-muted-foreground" title={link.description}>
                                    {link.description || "-"}
                                </div>
                                {/* 分类 / 标签 */}
                                <div className="w-28 shrink-0">
                                    <div className="truncate text-xs">{link.category?.name || "-"}</div>
                                    {link.tag && (
                                        <span className="mt-0.5 inline-block rounded bg-accent px-1.5 py-px text-[10px] text-accent-foreground">
                                            {link.tag.name}
                                        </span>
                                    )}
                                </div>
                                {/* 状态 */}
                                <div className="w-20 shrink-0 text-center">
                                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}>
                                        {badge.label}
                                    </span>
                                </div>
                                {/* 操作 */}
                                <div className="flex w-24 shrink-0 items-center justify-end gap-1">
                                    <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        aria-label="编辑"
                                        title="编辑"
                                        onClick={() => toast.info("编辑功能待接入")}
                                    >
                                        <Pencil className="size-4" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        aria-label="删除"
                                        title="删除"
                                        className="text-destructive hover:text-destructive"
                                        onClick={() => toast.info("删除功能待接入")}
                                    >
                                        <Trash2 className="size-4" />
                                    </Button>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* 底部：总数 + 每页条数 + 分页跳转 */}
            <div className="bg-slate-50 flex flex-wrap items-center justify-between gap-3 border-t px-4 py-2.5 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                    <div>
                        共 <span className="font-medium text-foreground">{total}</span> 条友链
                        {selected.size > 0 && (
                            <span className="ml-2 text-primary">已选 {selected.size} 条</span>
                        )}
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        {/* 每页条数 */}
                        <div className="flex items-center gap-1.5">
                            每页
                            <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
                                <SelectTrigger className="h-7 w-max text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {PAGE_SIZES.map((n) => (
                                        <SelectItem key={n} value={String(n)}>
                                            {n} 条
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>
                {/* 页数跳转 */}
                <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon-sm" disabled={page <= 1} onClick={() => goPage(page - 1)} aria-label="上一页">
                        <ChevronLeft className="size-4" />
                    </Button>
                    <span className="px-1 tabular-nums">
                        {page} / {totalPages}
                    </span>
                    <Button variant="outline" size="icon-sm" disabled={page >= totalPages} onClick={() => goPage(page + 1)} aria-label="下一页">
                        <ChevronRight className="size-4" />
                    </Button>
                    <Input
                        value={jumpPage}
                        onChange={(e) => setJumpPage(e.target.value.replace(/\D/g, ""))}
                        onKeyDown={(e) => { if (e.key === "Enter") jump(); }}
                        placeholder="页码"
                        className="h-7 w-14 text-xs"
                        aria-label="跳转到页码"
                    />
                    <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={jump}>
                        跳转
                    </Button>
                </div>
            </div>

        </div>
    );
}
