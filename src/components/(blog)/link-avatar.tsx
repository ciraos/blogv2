"use client";

import { useState } from "react";

/** 友链头像：加载失败时兜底显示固定头像 */
export function LinkAvatar({ src, alt }: { src: string; alt: string }) {
    const [imgSrc, setImgSrc] = useState<string>(src);

    return (
        <div className="size-12 shrink-0 overflow-hidden rounded-full border bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={imgSrc}
                alt={alt}
                className="h-full w-full object-cover"
                loading="lazy"
                onError={() => {
                    // 头像失效 → 固定兜底图（避免无限重试）
                    setImgSrc("https://cdn.jsdmirror.com/gh/ciraos/ciraos-static@main/img/404_1.avif");
                }}
            />
        </div>
    );
}
