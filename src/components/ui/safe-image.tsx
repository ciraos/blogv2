"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 图片加载失败时的默认占位图。
 *
 * 为什么用 SVG：站点里这些图（logo / 头像 / 横幅背景 / 打赏二维码）都是**后台可配**的，
 * 一旦配错（例如指向了没有公开权限的 `/api/pro/images/xx`，后端回 404），页面上就是一块裂图。
 * 换成一张中性灰的占位图，至少版面不崩，也能一眼看出「是图没加载出来」而不是「设计就这样」。
 */
export const DEFAULT_FALLBACK_IMAGE = "/placeholder.svg";

/**
 * 已告警过的源地址。
 *
 * 放在模块作用域，同一次页面会话里**同一个坏地址只 warn 一次** ——
 * 头像/logo 常常一页出现好几次，每次都打日志会把控制台刷满，反而不好定位。
 */
const warnedSources = new Set<string>();

/** 记录一次「图片加载失败」（同一个源地址只记一次），返回是否真的记录了 */
export function warnImageOnce(src: string, fallback: string, context?: string): boolean {
    if (warnedSources.has(src)) return false;
    warnedSources.add(src);
    const where = context ? `（${context}）` : "";
    console.warn(
        `[image] 图片加载失败，已替换为默认占位图${where}：\n  源地址 ${src}\n  占位图 ${fallback}\n` +
            `  · 若是 /api/pro/images/… 或 /api/image/…：后端 IsPublicImage 未通过（存储策略用途需为 article_image / comment_image / user_avatar，且文件要在策略根目录）\n` +
            `  · 若是 /api/f/…：直链必须带文件名（/api/f/{publicID}/{filename}），只写 id 会 301/308 循环`
    );
    return true;
}

export interface SafeImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src" | "onError"> {
    /** 图片地址（允许 null / undefined，此时整个元素不渲染） */
    src?: string | null;
    /** 加载失败时替换成的图片；默认 /placeholder.svg */
    fallbackSrc?: string;
    /** 占位图也失败时是否整个隐藏（默认 true，避免再出现一块裂图） */
    hideOnDoubleFailure?: boolean;
    /** 出问题时的定位提示，会写进 console.warn，例如 "站点 Logo" */
    context?: string;
    /** 额外回调（父组件想自己记状态时用） */
    onError?: () => void;
}

/**
 * 带失败兜底的 `<img>`。
 *
 * 行为：
 *  1. 正常渲染 `src`；
 *  2. `src` 加载失败 → `console.warn` 一次（按源地址去重）+ 换成 `fallbackSrc`；
 *  3. 占位图也失败（连本站静态资源都取不到）→ 默认隐藏，不再渲染裂图。
 *
 * 为什么不接 `next/image`：这些图来自后端同源代理（`/api/f`、`/api/pro/images`），
 * 主机名不在 `next.config.ts` 的 remotePatterns 里，`next/image` 会直接拒绝；
 * 现有代码本来也都是原生 `<img>`，这里保持一致。
 */
export function SafeImage({
    src,
    fallbackSrc = DEFAULT_FALLBACK_IMAGE,
    hideOnDoubleFailure = true,
    context,
    onError,
    className,
    alt = "",
    ...rest
}: SafeImageProps) {
    /** 记录「加载失败的那个源地址」，src 变化后自动重试（比对字符串而不是布尔） */
    const [failedSrc, setFailedSrc] = useState<string | null>(null);
    const [fallbackFailed, setFallbackFailed] = useState(false);
    const imgRef = useRef<HTMLImageElement>(null);

    const original = src?.trim() ?? "";
    const useFallback = original !== "" && failedSrc === original;
    const current = useFallback ? fallbackSrc : original;

    /** 统一的失败处理：先换兜底图，兜底图再失败就隐藏 */
    const fail = useCallback(() => {
        if (!original) return;
        if (!useFallback) {
            warnImageOnce(original, fallbackSrc, context);
            setFailedSrc(original);
        } else {
            setFallbackFailed(true);
        }
        onError?.();
    }, [original, useFallback, fallbackSrc, context, onError]);

    /**
     * 挂载后补一次「已经失败过」的判断。
     *
     * 关键：`<img>` 是 SSR 出来再水合的。如果请求在**水合完成前**就 404 了，
     * 那个 error 事件我们收不到（事件只派发给当时已存在的监听器），页面会一直停在裂图上
     * —— 实测页脚头像偶发这种情况。这里在挂载后看 `complete && naturalWidth === 0` 兜底。
     */
    useEffect(() => {
        const el = imgRef.current;
        if (!el || !original) return;
        const timer = window.setTimeout(() => {
            if (el.complete && el.naturalWidth === 0) fail();
        }, 0);
        return () => window.clearTimeout(timer);
    }, [current, original, fail]);

    if (!original) return null;
    if (useFallback && fallbackFailed && hideOnDoubleFailure) return null;

    return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
            {...rest}
            ref={imgRef}
            /* 告诉全局兜底（ImageFallbackWatcher）别再管这张图，避免两边同时改 src */
            data-safe-img="1"
            src={current}
            alt={alt}
            className={className}
            onError={fail}
        />
    );
}
