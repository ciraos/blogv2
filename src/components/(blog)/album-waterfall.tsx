"use client";
import { useCallback, useLayoutEffect, useRef } from "react";
import type { Album } from "@/lib/api";
import { resolveAssetUrl } from "@/lib/utils";

/** 相册页瀑布流/网格的配置（来自后端 site-config 的 album.waterfall 等字段） */
export interface AlbumGridConfig {
    /** waterfall = 按原图比例的瀑布流；grid = 等高方块网格（对齐官方两种 layout_mode） */
    mode: "waterfall" | "grid";
    /** 各断点列数（对齐官方 AlbumList：≤500 小屏 / ≤1200 中屏 / 其余大屏） */
    columnCount: { large: number; medium: number; small: number };
    /** 图片间距（px） */
    gap: number;
    /** 默认缩略图处理参数（相册项自带 thumbParam 时优先用它） */
    defaultThumbParam?: string;
}

/** 按视口宽度取列数（官方断点：500 / 1200） */
export function pickColumnCount(vw: number, columnCount: AlbumGridConfig["columnCount"]): number {
    if (vw <= 500) return Math.max(1, columnCount.small || 1);
    if (vw <= 1200) return Math.max(1, columnCount.medium || 1);
    return Math.max(1, columnCount.large || 1);
}

/** 拼接图片处理参数：已带查询串用 & 追加，参数里多余的 ? 前缀会被去掉 */
export function withImageParam(url: string, param?: string | null): string {
    const base = (url ?? "").trim();
    if (!base) return "";
    const p = (param ?? "").trim().replace(/^\?/, "");
    if (!p) return base;
    return base.includes("?") ? `${base}&${p}` : `${base}?${p}`;
}

/** 列表用缩略图地址（相册自身 thumbParam > 配置默认缩略图参数） */
export function albumThumbSrc(image: Album, defaultThumbParam?: string): string {
    return withImageParam(resolveAssetUrl(image.imageUrl) ?? "", image.thumbParam || defaultThumbParam);
}

/** grid 模式的等高方块（官方 .album-grid-item：40vh 高、最小 20em） */
function AlbumGridTile({ image, defaultThumbParam }: { image: Album; defaultThumbParam?: string }) {
    const src = albumThumbSrc(image, defaultThumbParam);
    return (
        <div className="group relative h-[calc(40vh-2em)] min-h-[20em] overflow-hidden bg-muted">
            {src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={src}
                    alt={image.title || "相册图片"}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                />
            ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">图片加载失败</div>
            )}
            {/* 底部渐变 + 标题（对齐官方网格项） */}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
            {(image.title || image.description) && (
                <div className="absolute inset-x-4 bottom-4 z-10 text-white">
                    {image.title && <div className="truncate text-sm font-semibold">{image.title}</div>}
                    {image.description && (
                        <div className="mt-0.5 line-clamp-2 text-xs text-white/85">{image.description}</div>
                    )}
                </div>
            )}
        </div>
    );
}

/**
 * 相册图片墙，按后端 album.waterfall 配置渲染：
 * - waterfall（默认）：JS 瀑布流，列数/间距来自 column_count 与 gap，图片保持原图比例；
 * - grid：CSS 等高网格（列数同样来自配置），对齐官方 layout_mode=grid 的整屏相册。
 * 瀑布流第 i 张放第 (i % cols) 列 —— 每行从左到右依次排列，第二行图片自然回到最左边。
 */
export function AlbumWaterfall({ images, config }: { images: Album[]; config: AlbumGridConfig }) {
    const { mode, columnCount, gap, defaultThumbParam } = config;
    const masonry = mode !== "grid";

    const containerRef = useRef<HTMLDivElement>(null);
    const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

    const layout = useCallback(() => {
        const container = containerRef.current;
        if (!container || !masonry) return;
        const cols = pickColumnCount(window.innerWidth, columnCount);
        const colW = Math.max(0, (container.clientWidth - gap * (cols - 1)) / cols);
        const colHeights = new Array(cols).fill(0);
        cardRefs.current.forEach((card, index) => {
            if (!card) return;
            card.style.position = "absolute";
            card.style.width = `${colW}px`;
            const h = card.offsetHeight;
            const col = index % cols;
            card.style.transform = `translate(${col * (colW + gap)}px, ${colHeights[col]}px)`;
            colHeights[col] += h + gap;
        });
        container.style.height = `${Math.max(...colHeights) - gap}px`;
    }, [masonry, columnCount, gap]);

    useLayoutEffect(() => {
        if (!masonry) return;
        layout();
        const ro = new ResizeObserver(() => layout());
        cardRefs.current.forEach((card) => card && ro.observe(card));
        window.addEventListener("resize", layout);
        return () => {
            ro.disconnect();
            window.removeEventListener("resize", layout);
        };
    }, [layout, images, masonry]);

    if (!masonry) {
        // grid 版式是「无缝图墙」：方块紧贴排列，不套用 waterfall.gap（对齐官方 grid 布局）。
        // 列数按配置的断点走 CSS 媒体查询（≤500 小屏 / ≤1200 中屏 / 其余大屏），
        // 不用 JS 测宽度 → 服务端与客户端渲染结果一致，避免 hydration 不匹配。
        const small = Math.max(1, columnCount.small || 1);
        const medium = Math.max(1, columnCount.medium || 1);
        const large = Math.max(1, columnCount.large || 1);
        return (
            <>
                <style>{`
                    .album-grid-wall {
                        display: grid;
                        gap: 0;
                        grid-template-columns: repeat(${small}, minmax(0, 1fr));
                    }
                    @media (min-width: 501px) {
                        .album-grid-wall { grid-template-columns: repeat(${medium}, minmax(0, 1fr)); }
                    }
                    @media (min-width: 1201px) {
                        .album-grid-wall { grid-template-columns: repeat(${large}, minmax(0, 1fr)); }
                    }
                `}</style>
                <div className="album-grid-wall w-full">
                    {images.map((image) => (
                        <AlbumGridTile key={image.id} image={image} defaultThumbParam={defaultThumbParam} />
                    ))}
                </div>
            </>
        );
    }

    return (
        <div ref={containerRef} className="relative w-full">
            {images.map((image, i) => {
                const src = albumThumbSrc(image, defaultThumbParam);
                return (
                    <div
                        key={image.id}
                        ref={(el) => {
                            cardRefs.current[i] = el;
                        }}
                        className="left-0 top-0"
                    >
                        {/* 图片 + 相册名同属一张卡片：整体 bg-card 底色 + 描边/阴影（没标题时就是纯图片卡片） */}
                        <figure className="group block overflow-hidden rounded-lg border border-border/60 bg-card shadow-sm transition-shadow hover:shadow-md">
                            <div className="overflow-hidden">
                                {src ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={src}
                                        alt={image.title || "相册图片"}
                                        loading="lazy"
                                        className="block w-full object-cover transition-transform duration-300 group-hover:scale-105"
                                    />
                                ) : (
                                    <div className="flex h-32 items-center justify-center bg-muted text-sm text-muted-foreground">
                                        图片加载失败
                                    </div>
                                )}
                            </div>
                            {(image.title || image.description) && (
                                <figcaption className="border-t border-border/60 p-3">
                                    {image.title && (
                                        <div className="truncate text-sm font-semibold">{image.title}</div>
                                    )}
                                    {image.description && (
                                        <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                                            {image.description}
                                        </div>
                                    )}
                                </figcaption>
                            )}
                        </figure>
                    </div>
                );
            })}
        </div>
    );
}
