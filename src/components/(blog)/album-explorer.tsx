"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";

import { AlbumWaterfall } from "@/components/(blog)/album-waterfall";
import type { Album, AlbumCategory } from "@/lib/api";
import { resolveAssetUrl } from "@/lib/utils";

/** 相册页页脚信息（站长头像/名称/备案，由服务端传入） */
export interface AlbumFooterInfo {
    avatar: string;
    siteName: string;
    icp: string;
    /** 公安备案号（为空则不显示） */
    policeNumber: string;
    /** 公安备案图标 */
    policeIcon: string;
}

interface AlbumExplorerProps {
    /** 全部相册（一次拉取） */
    albums: Album[];
    categories: AlbumCategory[];
    pageSize: number;
    footer: AlbumFooterInfo;
}

type SortMode = "default" | "latest" | "hot";

const SORT_LABELS: Record<SortMode, string> = {
    default: "默认排序",
    latest: "最新发布",
    hot: "热度排序",
};

function initials(name: string): string {
    return name.trim().charAt(0) || "站";
}

/** 页脚下拉容器：悬浮展开；离开后延迟收起（宽限期覆盖 trigger 与弹出面板之间的空隙） */
function FooterDropdown({
    trigger,
    align = "left",
    children,
}: {
    trigger: React.ReactNode;
    align?: "left" | "right";
    children: (close: () => void) => React.ReactNode;
}) {
    const [open, setOpen] = useState(false);
    // 关闭定时器 id 用 state 存（事件处理器里读写，避免渲染期访问 ref）
    const [closeTimer, setCloseTimer] = useState<number | null>(null);

    const openDropdown = () => {
        if (closeTimer !== null) {
            window.clearTimeout(closeTimer);
        }
        setCloseTimer(null);
        setOpen(true);
    };
    const scheduleClose = () => {
        if (closeTimer !== null) {
            window.clearTimeout(closeTimer);
        }
        // 延迟关闭：鼠标穿过 trigger 与弹出面板之间的空隙时不误收
        const id = window.setTimeout(() => {
            setCloseTimer(null);
            setOpen(false);
        }, 180);
        setCloseTimer(id);
    };

    /** 选择某项后立即收起 */
    const chooseAndClose = () => {
        setOpen(false);
        if (closeTimer !== null) {
            window.clearTimeout(closeTimer);
        }
        setCloseTimer(null);
    };

    return (
        <div className="relative" onMouseEnter={openDropdown} onMouseLeave={scheduleClose}>
            <div className="flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-sm transition-colors hover:bg-muted">
                {trigger}
            </div>
            {open && (
                <div
                    onMouseEnter={openDropdown}
                    onMouseLeave={scheduleClose}
                    className={`absolute bottom-full z-50 mb-1.5 min-w-36 rounded-lg border bg-popover p-1.5 text-popover-foreground shadow-lg ${
                        align === "right" ? "right-0" : "left-0"
                    }`}
                >
                    {children(chooseAndClose)}
                </div>
            )}
        </div>
    );
}

/**
 * 相册集浏览器：
 * 顶部直接瀑布流展示所有相册；图片流下方是居中分页条（左侧页码、右侧「共 N 张」）；
 * 底部固定工具条：左(站长头像+站点名) 中/右(分类下拉 / 排序下拉 / 关于 GitHub / ICP 备案)。
 */
export function AlbumExplorer({ albums, categories, pageSize, footer }: AlbumExplorerProps) {
    // 筛选/排序/分页全部本地完成
    const [categoryId, setCategoryId] = useState<number | null>(null); // null = 全部
    const [sort, setSort] = useState<SortMode>("default");
    const [page, setPage] = useState(1);

    // 分类过滤 + 排序
    const filtered = useMemo(() => {
        const list = categoryId === null ? [...albums] : albums.filter((a) => a.categoryId === categoryId);
        if (sort === "latest") {
            list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        } else if (sort === "hot") {
            list.sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0));
        }
        // 默认排序：保持接口顺序
        return list;
    }, [albums, categoryId, sort]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const safePage = Math.min(page, totalPages);
    const pageItems = useMemo(
        () => filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
        [filtered, safePage, pageSize]
    );

    const currentCategoryName =
        categories.find((c) => c.id === categoryId)?.name ?? "全部";

    const avatar = resolveAssetUrl(footer.avatar);

    return (
        <div className="flex min-h-dvh flex-col">
            {/* 主体内容（底部给固定工具条留白；无 padding、宽度铺满整个屏幕） */}
            <div className="w-full flex-1 pb-24">
                {albums.length === 0 ? (
                    /* 全站无相册（非筛选导致）：明确空态 */
                    <div className="flex w-full flex-col items-center justify-center gap-2 py-32 text-sm text-muted-foreground">
                        <span className="text-5xl">📷</span>
                        <span>暂无相册，敬请期待</span>
                    </div>
                ) : pageItems.length === 0 ? (
                    /* 当前分类筛选后为空 */
                    <div className="flex w-full flex-col items-center justify-center gap-2 py-32 text-sm text-muted-foreground">
                        <span className="text-5xl">🖼️</span>
                        <span>该分类下暂无相册</span>
                        <button
                            type="button"
                            onClick={() => setCategoryId(null)}
                            className="mt-1 rounded-md border px-3 py-1 text-xs transition-colors hover:bg-muted"
                        >
                            查看全部分类
                        </button>
                    </div>
                ) : (
                    /* 瀑布流：多列（单列更小），保留原图比例 */
                    <AlbumWaterfall images={pageItems} />
                )}

                {/* 分页条：居中（左侧页码、右侧「共 N 张」） */}
                {totalPages > 1 || filtered.length > 0 ? (
                    <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
                        {/* 左侧：页码按钮组 */}
                        <div className="flex items-center gap-1.5">
                            <button
                                type="button"
                                disabled={safePage <= 1}
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                aria-label="上一页"
                                title="上一页"
                                className="flex size-8 items-center justify-center rounded-md border transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                <ChevronLeft className="size-4" />
                            </button>
                            <span className="px-1 text-sm tabular-nums">
                                {safePage} / {totalPages}
                            </span>
                            <button
                                type="button"
                                disabled={safePage >= totalPages}
                                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                aria-label="下一页"
                                title="下一页"
                                className="flex size-8 items-center justify-center rounded-md border transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                <ChevronRight className="size-4" />
                            </button>
                        </div>
                        {/* 右侧：共 N 张（相册数） */}
                        <span className="text-xs text-muted-foreground">共 {filtered.length} 张</span>
                    </div>
                ) : null}
            </div>

            {/* 底部固定工具条 */}
            <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 shadow-[0_-4px_20px_-8px_rgba(0,0,0,0.15)] backdrop-blur">
                <div className="flex h-14 w-full items-center justify-between gap-3 px-3 sm:px-4">
                    {/* 左：站长头像 + 站点名（点击回首页 /） */}
                    <Link href="/" className="flex min-w-0 items-center gap-2 transition-opacity hover:opacity-80">
                        {avatar ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={avatar}
                                alt={footer.siteName}
                                className="size-8 shrink-0 rounded-full object-cover"
                            />
                        ) : (
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                                {initials(footer.siteName)}
                            </span>
                        )}
                        <span className="truncate text-sm font-bold">{footer.siteName}</span>
                    </Link>

                    {/* 中右：分类 / 排序 / 关于 / 备案 */}
                    <div className="flex items-center gap-1 sm:gap-2">
                        {/* 分类下拉 */}
                        <FooterDropdown
                            trigger={
                                <>
                                    分类：{currentCategoryName}
                                    <ChevronDown className="size-3.5 opacity-60" />
                                </>
                            }
                        >
                            {(close) => (
                                <div className="space-y-0.5">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setCategoryId(null);
                                            setPage(1);
                                            close();
                                        }}
                                        className={`block w-full rounded px-2 py-1 text-left text-sm transition-colors hover:bg-muted ${categoryId === null ? "bg-primary/10 font-medium text-primary" : ""}`}
                                    >
                                        全部
                                    </button>
                                    {categories.map((c) => (
                                        <button
                                            key={c.id}
                                            type="button"
                                            onClick={() => {
                                                setCategoryId(c.id);
                                                setPage(1);
                                                close();
                                            }}
                                            className={`block w-full rounded px-2 py-1 text-left text-sm transition-colors hover:bg-muted ${categoryId === c.id ? "bg-primary/10 font-medium text-primary" : ""}`}
                                        >
                                            {c.name}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </FooterDropdown>

                        {/* 排序下拉 */}
                        <FooterDropdown
                            trigger={
                                <>
                                    {SORT_LABELS[sort]}
                                    <ChevronDown className="size-3.5 opacity-60" />
                                </>
                            }
                            align="right"
                        >
                            {(close) => (
                                <div className="space-y-0.5">
                                    {(Object.keys(SORT_LABELS) as SortMode[]).map((mode) => (
                                        <button
                                            key={mode}
                                            type="button"
                                            onClick={() => {
                                                setSort(mode);
                                                setPage(1);
                                                close();
                                            }}
                                            className={`block w-full rounded px-2 py-1 text-left text-sm transition-colors hover:bg-muted ${sort === mode ? "bg-primary/10 font-medium text-primary" : ""}`}
                                        >
                                            {SORT_LABELS[mode]}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </FooterDropdown>

                        {/* 关于：anheyu-app GitHub */}
                        <a
                            href="https://github.com/anzhiyu-c/anheyu-app"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 rounded px-2 py-1 text-sm transition-colors hover:bg-muted"
                        >
                            关于
                            <ExternalLink className="size-3.5 opacity-60" />
                        </a>

                        {/* 备案（ICP 有值显示；公安无值不显示） */}
                        {footer.icp && (
                            <a
                                href="https://beian.miit.gov.cn"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="ml-1 hidden text-xs text-muted-foreground hover:underline sm:block"
                            >
                                {footer.icp}
                            </a>
                        )}
                        {footer.policeNumber && (
                            <a
                                href="https://www.beian.gov.cn/portal/registerSystemInfo?recordcode="
                                className="ml-1 hidden items-center gap-1 text-xs text-muted-foreground hover:underline md:flex"
                            >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={footer.policeIcon} alt="" className="size-3.5" />
                                {footer.policeNumber}
                            </a>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
