import { Suspense } from "react";
import type { Metadata } from "next";

import { ExternalLinkWarningClient } from "./external-link-warning-client";

export const metadata: Metadata = {
    title: "外部链接提示",
    description: "跳转外部站点前的安全提示页。",
    robots: { index: false, follow: false },
};

/**
 * 外链跳转提示页（`ENABLE_EXTERNAL_LINK_WARNING` 开启时由拦截器导到这里）。
 * useSearchParams 需要 Suspense 边界，否则构建期会被判成需要 CSR bailout。
 */
export default function ExternalLinkWarningPage() {
    return (
        <Suspense fallback={null}>
            <ExternalLinkWarningClient />
        </Suspense>
    );
}
