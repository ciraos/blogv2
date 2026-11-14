"use client";

import { useEffect } from "react";

import { initExternalLinkInterceptor } from "@/lib/external-link";

/**
 * 外链拦截器（前台 layout 挂载）：只有站点设置里开了 ENABLE_EXTERNAL_LINK_WARNING 才生效。
 * 关掉时什么都不装，点击行为与原来完全一致。
 */
export function ExternalLinkInterceptor({ enabled }: { enabled: boolean }) {
    useEffect(() => {
        if (!enabled) return;
        return initExternalLinkInterceptor();
    }, [enabled]);

    return null;
}
