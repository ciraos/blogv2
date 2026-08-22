"use client";

import { useState } from "react";

interface LinkAvatarProps {
    src: string;
    alt: string;
    /** 图片加载失败时回调（父组件切换到首字头像兜底） */
    onError?: () => void;
}

/** 友链头像：加载失败时由父组件兜底显示首字圆形头像 */
export function LinkAvatar({ src, alt, onError }: LinkAvatarProps) {
    const [failed, setFailed] = useState(false);

    if (failed) {
        return null;
    }

    return (
        <div className="size-12 shrink-0 overflow-hidden rounded-full border bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={src}
                alt={alt}
                className="h-full w-full object-cover"
                loading="lazy"
                onError={() => {
                    // 失败后本组件渲染 null，并通知父组件显示首字兜底
                    setFailed(true);
                    onError?.();
                }}
            />
        </div>
    );
}
