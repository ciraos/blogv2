"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";
import type { LyricLine } from "@/types/music";
import styles from "../music.module.css";

/**
 * 歌词滚动区（参照项目 _components/LyricsScroll.tsx 的精简版）。
 *
 * 结构与 class 名沿用上游，只保留「当前行变化后把它滚到容器正中」这一件事 ——
 * 上游是靠 `.lyricsScrollContent` 上下各 300px 留白 + JS 计算 scrollTop 实现的
 * （见 music.module.css 末尾的本地适配说明）。
 * 暂未实现：点击歌词跳转、用户手动滚动后暂停自动跟随。
 */
export function LyricsScroll({
    lyrics,
    currentIndex,
    dominantColor,
}: {
    lyrics: LyricLine[];
    currentIndex: number;
    dominantColor: string;
}) {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const container = containerRef.current;
        const current = container?.querySelector<HTMLElement>(`[data-index="${currentIndex}"]`);
        if (!container || !current) return;
        // 与上游 calculateTargetScrollTop 的桌面分支一致：offsetTop - 容器高/2 + 行高/2
        const top = current.offsetTop - container.clientHeight / 2 + current.offsetHeight / 2;
        container.scrollTo({ top, behavior: "smooth" });
    }, [currentIndex, lyrics.length]);

    return (
        <div
            ref={containerRef}
            className={styles.lyricsScroll}
            style={{ "--dominant-color": dominantColor } as React.CSSProperties}
        >
            <div className={styles.lyricsScrollContent}>
                {lyrics.length === 0 ? (
                    <div className={cn(styles.lyricItem, styles.noLyrics)}>
                        <div className={styles.lyricText}>♪ 暂无歌词 ♪</div>
                    </div>
                ) : (
                    lyrics.map((line, index) => (
                        <div
                            key={`${line.time}-${index}`}
                            data-index={index}
                            className={cn(
                                styles.lyricItem,
                                index === currentIndex
                                    ? styles.isCurrent
                                    : index < currentIndex
                                        ? styles.isPassed
                                        : styles.isUpcoming
                            )}
                        >
                            <div className={styles.lyricText}>{line.text}</div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
