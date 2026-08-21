"use client";

import { useEffect } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

export interface LightboxImage {
    src: string;
}

interface EssayLightboxProps {
    images: LightboxImage[];
    index: number;
    onClose: () => void;
    onIndexChange: (index: number) => void;
}

/** 说说图片看图器：主图居中、左右箭头切换、右上角关闭、底部显示本页全部图片缩略图 */
export function EssayLightbox({ images, index, onClose, onIndexChange }: EssayLightboxProps) {
    const total = images.length;
    const current = images[index];

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                onClose();
                return;
            }
            if (e.key === "ArrowLeft") onIndexChange((index - 1 + total) % total);
            if (e.key === "ArrowRight") onIndexChange((index + 1) % total);
        };
        window.addEventListener("keydown", onKey);
        // 打开时锁定页面滚动
        document.body.style.overflow = "hidden";
        return () => {
            window.removeEventListener("keydown", onKey);
            document.body.style.overflow = "";
        };
    }, [index, total, onClose, onIndexChange]);

    if (!current) return null;

    return (
        <div
            className="fixed inset-0 z-[999] flex flex-col bg-black/90"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-label="图片预览"
        >
            {/* 右上角关闭 */}
            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    onClose();
                }}
                className="absolute right-4 top-4 z-10 rounded-full bg-white/10 p-2.5 text-white transition-colors hover:bg-white/25"
                aria-label="关闭"
            >
                <X className="size-5" />
            </button>

            {/* 计数 */}
            <div className="absolute left-4 top-4 z-10 rounded-full bg-black/40 px-3 py-1.5 text-xs text-white/90">
                {index + 1} / {total}
            </div>

            {/* 左右箭头 */}
            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    onIndexChange((index - 1 + total) % total);
                }}
                className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white transition-colors hover:bg-white/25"
                aria-label="上一张"
            >
                <ChevronLeft className="size-6" />
            </button>
            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    onIndexChange((index + 1) % total);
                }}
                className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white transition-colors hover:bg-white/25"
                aria-label="下一张"
            >
                <ChevronRight className="size-6" />
            </button>

            {/* 主图 */}
            <div
                className="flex min-h-0 flex-1 items-center justify-center px-14 py-4"
                onClick={(e) => e.stopPropagation()}
            >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    key={current.src}
                    src={current.src}
                    alt=""
                    className="max-h-full max-w-full rounded-lg object-contain"
                />
            </div>

            {/* 底部：本页全部说说图片缩略图 */}
            <div className="shrink-0 overflow-x-auto px-4 pb-5" onClick={(e) => e.stopPropagation()}>
                <div className="mx-auto flex w-max gap-2">
                    {images.map((img, i) => (
                        <button
                            key={i}
                            type="button"
                            onClick={() => onIndexChange(i)}
                            className={`shrink-0 overflow-hidden rounded-lg transition-all ${
                                i === index ? "ring-2 ring-white" : "opacity-60 hover:opacity-100"
                            }`}
                            aria-label={`查看第 ${i + 1} 张`}
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={img.src} alt="" loading="lazy" className="h-14 w-14 object-cover" />
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
