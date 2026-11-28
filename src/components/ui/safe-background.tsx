"use client";

import { useEffect, useState } from "react";

import { DEFAULT_FALLBACK_IMAGE, warnImageOnce } from "@/components/ui/safe-image";

export interface SafeBackgroundProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
    /** 背景图地址 */
    src?: string | null;
    /** 加载失败时的定位提示（写进 console.warn） */
    context?: string;
    /** 失败后是否保留一个中性底色（默认 true） */
    fallbackClassName?: string;
}

/**
 * `background-image` 的兜底版。
 *
 * 为什么单独做：CSS 背景图**没有 onError**，加载失败时浏览器什么都不会画
 * （不会有裂图图标，所以更隐蔽 —— 页面上就是一块空白）。这里用 `new Image()` 预加载探测：
 *  - 成功 → 正常渲染背景图；
 *  - 失败 → `console.warn` 一次 + 换成中性底色（或占位图），不再留空白。
 *
 * 只用于「静态写死」的 CSS 背景（微信卡片正/背面、关于页统计卡封面等）；
 * 用 `<img>` 渲染的图请走 `SafeImage` / `CoverImage`。
 */
export function SafeBackground({
    src,
    context,
    fallbackClassName = "bg-muted",
    className,
    style,
    ...rest
}: SafeBackgroundProps) {
    const [failed, setFailed] = useState(false);
    const url = src?.trim() ?? "";

    useEffect(() => {
        if (!url) return;
        let cancelled = false;
        const probe = new window.Image();
        probe.onerror = () => {
            if (cancelled) return;
            warnImageOnce(url, DEFAULT_FALLBACK_IMAGE, context);
            setFailed(true);
        };
        probe.src = url;
        return () => {
            cancelled = true;
            probe.onerror = null;
        };
    }, [url, context]);

    // 换了新地址要重新探测（否则上一张失败会一直压着新图）
    const active = failed ? "" : url;

    return (
        <div
            {...rest}
            className={active ? className : [className, fallbackClassName].filter(Boolean).join(" ")}
            style={
                active
                    ? { backgroundImage: `url("${active}")`, ...style }
                    : { backgroundImage: "none", ...style }
            }
        />
    );
}
