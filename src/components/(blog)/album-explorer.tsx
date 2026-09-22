"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";

import { AlbumWaterfall, type AlbumGridConfig } from "@/components/(blog)/album-waterfall";
import { PaginationControls } from "@/components/pagination-controls";
import type { Album, AlbumCategory } from "@/lib/api";
import { resolveAssetUrl } from "@/lib/utils";

/** 相册页附加信息（由服务端传入；过滤条右侧展示） */
export interface AlbumFooterInfo {
    /** 公安备案号（为空则不显示） */
    policeNumber: string;
    /** 公安备案图标 */
    policeIcon: string;
}

/** 相册页版式配置（全部来自后端 site-config 的 album 字段） */
export interface AlbumPageConfig {
    /** waterfall = 博客版式（横幅 + 瀑布流 + 分页 + 评论）；grid = 整屏相册版式 */
    layoutMode: "waterfall" | "grid";
    /** 每页图片数（album.page_size） */
    pageSize: number;
    /** 顶部横幅（album.banner） */
    banner: { background: string; title: string; tip: string; description: string };
    /** 瀑布流列数与间距（album.waterfall） */
    waterfall: AlbumGridConfig["columnCount"] & { gap: number };
    /** 默认缩略图处理参数（album.default_thumb_param） */
    defaultThumbParam: string;
    /** 「关于」跳转（album.about_link，留空则用全局 ABOUT_LINK） */
    aboutLink: string;
}

interface AlbumExplorerProps {
    /** 全部相册（一次拉取，前端做分类/排序/分页） */
    albums: Album[];
    categories: AlbumCategory[];
    config: AlbumPageConfig;
    footer: AlbumFooterInfo;
    /** 评论区（服务端按 album.enable_comment 决定是否传入） */
    children?: React.ReactNode;
}

type SortMode = "default" | "latest" | "hot";

const SORT_LABELS: Record<SortMode, string> = {
    default: "默认排序",
    latest: "最新发布",
    hot: "热度排序",
};

/** 顶部横幅（album.banner：背景图 + tip + 标题 + 描述） */
function AlbumBanner({ banner }: { banner: AlbumPageConfig["banner"] }) {
    const bg = resolveAssetUrl(banner.background);
    if (!banner.title && !bg) return null;
    return (
        <div className="relative flex h-56 flex-col justify-between overflow-hidden rounded-xl p-5 text-white md:h-75 md:p-8">
            {bg && (
                <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={bg} alt="" className="absolute inset-0 h-full w-full object-cover" />
                    {/* 遮罩：保证文字可读性 */}
                    <div className="absolute inset-0 bg-black/35" />
                </>
            )}
            <div className="relative z-10">
                {banner.tip && <div className="mb-2 text-[.75rem] font-medium text-white/80">{banner.tip}</div>}
                {banner.title && (
                    <div className="text-3xl font-bold leading-[1.2] md:text-[2.25rem]">{banner.title}</div>
                )}
            </div>
            {banner.description && (
                <div className="relative z-10 line-clamp-2 text-[.875rem] leading-normal text-white/90">
                    {banner.description}
                </div>
            )}
        </div>
    );
}

/**
 * 下拉容器（分类 / 排序）：悬停展开、点按切换。
 *
 * 关键点：面板与触发器之间留的空隙会让指针「离开」外层容器而误触发收起，
 * 所以这里 (1) 面板外壳用 padding 把空隙也变成自己的可命中区域（透明桥），
 * (2) 收起再延迟 180ms 兜底，鼠标往下移到面板上时不会闪关。
 */
function FilterDropdown({
    trigger,
    align = "left",
    children,
}: {
    trigger: React.ReactNode;
    align?: "left" | "right";
    children: (close: () => void) => React.ReactNode;
}) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const closeTimer = useRef<number | null>(null);

    const clearCloseTimer = useCallback(() => {
        if (closeTimer.current !== null) {
            window.clearTimeout(closeTimer.current);
            closeTimer.current = null;
        }
    }, []);

    /** 立即收起：只改状态。面板里的选项会拿到这个回调，所以它不碰 ref
     *  （渲染期通过 render prop 传递函数，访问 ref 会触发 react-hooks/refs 告警）。 */
    const closeNow = useCallback(() => setOpen(false), []);

    const openNow = useCallback(() => {
        clearCloseTimer();
        setOpen(true);
    }, [clearCloseTimer]);

    /** 延迟收起：给指针留出跨越空隙、移到面板上的时间 */
    const scheduleClose = useCallback(() => {
        clearCloseTimer();
        closeTimer.current = window.setTimeout(() => {
            closeTimer.current = null;
            setOpen(false);
        }, 180);
    }, [clearCloseTimer]);

    // 收起后清掉可能还在等待的定时器
    useEffect(() => {
        if (!open) clearCloseTimer();
    }, [open, clearCloseTimer]);

    // 组件卸载时清掉定时器
    useEffect(() => clearCloseTimer, [clearCloseTimer]);

    // 展开时：点击面板外部 / 按 Esc 收起
    useEffect(() => {
        if (!open) return;
        const onPointerDown = (event: MouseEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) {
                clearCloseTimer();
                setOpen(false);
            }
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                clearCloseTimer();
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", onPointerDown);
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("mousedown", onPointerDown);
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [open, clearCloseTimer]);

    return (
        <div ref={rootRef} className="relative" onMouseEnter={openNow} onMouseLeave={scheduleClose}>
            <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={() => (open ? closeNow() : openNow())}
                className="flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-muted"
            >
                {trigger}
            </button>
            {open && (
                <div className={`absolute top-full z-50 min-w-36 ${align === "right" ? "right-0" : "left-0"}`}>
                    {/* pt-1.5：把触发器与面板之间的空隙填成可命中区域，鼠标滑下来不会离开容器 */}
                    <div className="pt-1.5">
                        <div className="rounded-lg border bg-popover p-1.5 text-popover-foreground shadow-lg">
                            {children(closeNow)}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

/**
 * 相册集浏览器：版式完全由后端 album 配置决定。
 * - layout_mode=waterfall（默认）：博客版式 —— 顶部 banner + 瀑布流 + 居中分页 + 评论区；
 * - layout_mode=grid：整屏相册版式 —— 顶部固定工具条（分类 / 排序 / 关于 / 备案）+ 等高网格。
 * 列数与间距取 album.waterfall.column_count / gap，每页数量取 album.page_size。
 */
export function AlbumExplorer({ albums, categories, config, footer, children }: AlbumExplorerProps) {
    // 筛选/排序/分页全部本地完成
    const [categoryId, setCategoryId] = useState<number | null>(null); // null = 全部
    const [sort, setSort] = useState<SortMode>("default");
    const [page, setPage] = useState(1);

    const isGrid = config.layoutMode === "grid";
    const pageSize = Math.max(1, config.pageSize || 24);

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

    const currentCategoryName = categories.find((c) => c.id === categoryId)?.name ?? "全部";

    const gridConfig: AlbumGridConfig = {
        mode: config.layoutMode,
        columnCount: config.waterfall,
        gap: config.waterfall.gap,
        defaultThumbParam: config.defaultThumbParam,
    };

    /** 图片墙 / 空态 */
    const body =
        albums.length === 0 ? (
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
            <AlbumWaterfall images={pageItems} config={gridConfig} />
        );

    /** 分页条：居中（左侧页码、右侧「共 N 张」） */
    const pagination =
        totalPages > 1 || filtered.length > 0 ? (
            <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
                <PaginationControls page={safePage} totalPages={totalPages} onPageChange={setPage} />
                <span className="text-xs text-muted-foreground">共 {filtered.length} 张</span>
            </div>
        ) : null;

    /** 过滤条：右对齐的分类 / 排序 / 关于（+ 公安备案），两种版式都放在图片墙正上方 */
    const filterBar = (
        <div className="sticky top-0 z-30 -mx-4 flex flex-wrap items-center justify-end gap-1 border-b bg-background/90 px-3 py-2 backdrop-blur sm:-mx-0 sm:rounded-xl sm:border">
            {categories.length > 0 && (
                <FilterDropdown
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
                </FilterDropdown>
            )}

            <FilterDropdown
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
            </FilterDropdown>

            {config.aboutLink && (
                <a
                    href={config.aboutLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-muted"
                >
                    关于
                    <ExternalLink className="size-3.5 opacity-60" />
                </a>
            )}

            {/* 备案号不在相册过滤条里重复展示（(blog) 布局的页脚已有 ICP 备案） */}
            {footer.policeNumber && (
                <a
                    href="https://www.beian.gov.cn/portal/registerSystemInfo?recordcode="
                    className="hidden items-center gap-1 text-xs text-muted-foreground hover:underline md:flex"
                >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={footer.policeIcon} alt="" className="size-3.5" />
                    {footer.policeNumber}
                </a>
            )}
        </div>
    );

    /* ===== grid 版式：横幅 + 顶部工具条 + 无缝等高网格 + 分页 + 评论区 ===== */
    if (isGrid) {
        return (
            <div className="w-full space-y-4">
                {/* 顶部大图与 waterfall 版式一致（同样读 album.banner） */}
                <AlbumBanner banner={config.banner} />

                {filterBar}

                {body}
                {pagination}
                {children}
            </div>
        );
    }

    /* ===== waterfall 版式（默认）：横幅 + 过滤条 + 瀑布流 + 分页 + 评论区 ===== */
    return (
        <div className="w-full space-y-4">
            <AlbumBanner banner={config.banner} />
            {filterBar}
            {body}
            {pagination}
            {children}
        </div>
    );
}
