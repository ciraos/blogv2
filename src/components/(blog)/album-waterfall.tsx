"use client";
import { useCallback, useLayoutEffect, useRef } from "react";
import type { Album } from "@/lib/api";
import { resolveAssetUrl } from "@/lib/utils";

const GAP = 0;

function getCols(vw: number): number {
    if (vw >= 1280) return 4;
    if (vw >= 1024) return 3;
    if (vw >= 640) return 2;
    return 1;
}

/**
 * 相册 JS 瀑布流（顺序循环列）：桌面 4/3 列、平板 2 列、移动 1 列。
 * 第 i 张图放第 (i % cols) 列 —— 每行从左到右依次排列，
 * 第二行的图片自然落在最左边。
 * 图片加载后按真实比例显示，高度变化由 ResizeObserver 触发重排。
 */
export function AlbumWaterfall({ images }: { images: Album[] }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

    const layout = useCallback(() => {
        const container = containerRef.current;
        if (!container) return;
        const cols = getCols(window.innerWidth);
        const colW = (container.clientWidth - GAP * (cols - 1)) / cols;
        const colHeights = new Array(cols).fill(0);
        cardRefs.current.forEach((card, index) => {
            if (!card) return;
            card.style.position = "absolute";
            card.style.width = `${colW}px`;
            const h = card.offsetHeight;
            // 顺序循环分配列：第 i 张放第 (i % cols) 列，保证每行从左到右依次排
            const col = index % cols;
            card.style.transform = `translate(${col * (colW + GAP)}px, ${colHeights[col]}px)`;
            colHeights[col] += h + GAP;
        });
        container.style.height = `${Math.max(...colHeights) - GAP}px`;
    }, []);

    useLayoutEffect(() => {
        layout();
        const ro = new ResizeObserver(() => layout());
        cardRefs.current.forEach((card) => card && ro.observe(card));
        window.addEventListener("resize", layout);
        return () => {
            ro.disconnect();
            window.removeEventListener("resize", layout);
        };
    }, [layout, images]);

    return (
        <div ref={containerRef} className="relative w-full">
            {images.map((image, i) => {
                const src = resolveAssetUrl(image.bigImageUrl || image.imageUrl);
                return (
                    <div
                        key={image.id}
                        ref={(el) => {
                            cardRefs.current[i] = el;
                        }}
                        className="left-0 top-0"
                    >
                        <figure className="group overflow-hidden rounded-none border bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
                            <div className="overflow-hidden">
                                {src ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={src}
                                        alt={image.title || "相册图片"}
                                        loading="lazy"
                                        className="w-full object-cover transition-transform duration-300 group-hover:scale-105"
                                    />
                                ) : (
                                    <div className="flex h-40 items-center justify-center bg-muted text-sm text-muted-foreground">
                                        图片加载失败
                                    </div>
                                )}
                            </div>
                            {(image.title || image.description) && (
                                <figcaption className="p-3">
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