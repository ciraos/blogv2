"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

import { warnImageOnce } from "@/components/ui/safe-image";

/**
 * 文章封面的兜底图（public/default-cover-v2.png）。
 *
 * 文件名带 `-v2` 是为了让新图能绕开 next/image / 浏览器 / CDN 按 URL 的缓存
 * （不能加 `?v=2`：本项目 localPatterns 只允许空 search，next/image 会报错）。
 */
export const DEFAULT_COVER_IMAGE = "/default-cover-v2.png";

export interface CoverImageProps extends Omit<React.ComponentProps<typeof Image>, "src" | "onError"> {
    /** 封面地址（resolvePostCover 的结果） */
    src?: string | null;
    /** 加载失败时的兜底图，默认 /default-cover-v2.png */
    fallbackSrc?: string;
    /** 写进 console.warn 的定位提示，例如 "首页头条封面" */
    context?: string;
}

/**
 * 文章封面的 `<Image>` 兜底版。
 *
 * 为什么单独一个组件：封面走的是 `next/image`（要经过 /_next/image 优化），
 * 而 `SafeImage` 是原生 `<img>`，两者不能混用。这里保留 `next/image` 的优化，
 * 只在 **封面地址 404 / 图片损坏** 时换成默认封面，并 console.warn 一次。
 *
 * 触发场景很真实：文章封面存的是 `/api/pro/images/…`，后端 IsPublicImage 不通过就是 404，
 * 页面上原本是一块裂图图标。
 */
export function CoverImage({ src, fallbackSrc = DEFAULT_COVER_IMAGE, context, alt = "", ...rest }: CoverImageProps) {
    const [failedSrc, setFailedSrc] = useState<string | null>(null);
    const [fallbackFailed, setFallbackFailed] = useState(false);
    const imgRef = useRef<HTMLImageElement>(null);

    const original = src?.trim() ?? "";
    const useFallback = original !== "" && failedSrc === original;
    const current = useFallback ? fallbackSrc : original;

    const fail = useCallback(() => {
        if (!original) return;
        if (!useFallback) {
            warnImageOnce(original, fallbackSrc, context);
            setFailedSrc(original);
        } else {
            setFallbackFailed(true);
        }
    }, [original, useFallback, fallbackSrc, context]);

    /** 同 SafeImage：兜住「水合前就已失败」的情况 */
    useEffect(() => {
        const el = imgRef.current;
        if (!el || !original) return;
        const timer = window.setTimeout(() => {
            if (el.complete && el.naturalWidth === 0) fail();
        }, 0);
        return () => window.clearTimeout(timer);
    }, [current, original, fail]);

    if (!original) return null;
    // 连默认封面都取不到（本站静态资源异常）就整体不渲染，避免再出现一块裂图
    if (useFallback && fallbackFailed) return null;

    return (
        <Image
            {...rest}
            ref={imgRef}
            data-safe-img="1"
            src={current}
            alt={alt}
            onError={fail}
        />
    );
}
