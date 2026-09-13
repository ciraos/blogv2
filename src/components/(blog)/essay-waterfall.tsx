"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";

import type { Essay } from "@/types/essays";
import { resolveAssetUrl } from "@/lib/utils";

import { EssayCard } from "./essay-card";
import { EssayLightbox } from "./essay-lightbox";

const GAP = 16;

/** 列数按内容容器实际宽度决定（非视口宽），保证带右侧栏/收缩栏时卡片始终落在内容区内，不与侧边栏重叠 */
function getCols(cw: number): number {
    if (cw >= 920) return 3;
    if (cw >= 560) return 2;
    return 1;
}

/** 即刻 / 说说 JS 瀑布流（最短列放置，对齐线上格式；点击图片打开看图器） */
export function EssayWaterfall({ essays }: { essays: Essay[] }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
    const [lightbox, setLightbox] = useState<number | null>(null);

    // 本页全部图片（拍平，带全局索引，供看图器底部缩略图条使用）
    const images = useMemo(
        () =>
            essays.flatMap((e) =>
                (e.image ?? [])
                    .map((url) => resolveAssetUrl(url))
                    .filter((url): url is string => url !== null)
                    .map((src) => ({ src })),
            ),
        [essays],
    );

    // 每篇说说第一张图片的全局偏移
    const offsets = useMemo(() => {
        const list: number[] = [];
        let acc = 0;
        for (const e of essays) {
            list.push(acc);
            acc += (e.image ?? []).filter((url) => resolveAssetUrl(url) !== null).length;
        }
        return list;
    }, [essays]);

    const layout = useCallback(() => {
        const container = containerRef.current;
        if (!container) return;
        const cw = container.clientWidth;
        const cols = getCols(cw);
        const colW = (cw - GAP * (cols - 1)) / cols;
        const colHeights = new Array(cols).fill(0);
        cardRefs.current.forEach((card) => {
            if (!card) return;
            card.style.position = "absolute";
            card.style.width = `${colW}px`;
            const h = card.offsetHeight;
            const col = colHeights.indexOf(Math.min(...colHeights));
            card.style.transform = `translate(${col * (colW + GAP)}px, ${colHeights[col]}px)`;
            colHeights[col] += h + GAP;
        });
        container.style.height = `${Math.max(...colHeights) - GAP}px`;
    }, []);

    useLayoutEffect(() => {
        const container = containerRef.current;
        layout();
        // 重新布局触发源：
        //  1) 容器宽度变化（侧边栏展开/收起、窗口尺寸变化）—— 必须监听容器本身，否则宽度变了列宽不更新，卡片会压到侧边栏上
        //  2) 卡片高度变化（图片/字体加载完成）
        const ro = new ResizeObserver(() => layout());
        if (container) ro.observe(container);
        cardRefs.current.forEach((card) => card && ro.observe(card));
        window.addEventListener("resize", layout);
        return () => {
            ro.disconnect();
            window.removeEventListener("resize", layout);
        };
    }, [layout, essays]);

    return (
        <>
            <div ref={containerRef} className="relative w-full">
                {essays.map((essay, i) => (
                    <div
                        key={essay.id}
                        ref={(el) => {
                            cardRefs.current[i] = el;
                        }}
                        className="left-0 top-0"
                    >
                        <EssayCard essay={essay} onImageClick={(local) => setLightbox(offsets[i] + local)} />
                    </div>
                ))}
            </div>

            {lightbox !== null && images[lightbox] && (
                <EssayLightbox
                    images={images}
                    index={lightbox}
                    onClose={() => setLightbox(null)}
                    onIndexChange={(n) => setLightbox(n)}
                />
            )}
        </>
    );
}
