"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCw, TriangleAlert } from "lucide-react";

// Error boundaries must be Client Components
export default function Error({
    error,
    unstable_retry,
}: {
    error: Error & { digest?: string };
    unstable_retry: () => void;
}) {
    useEffect(() => {
        console.error(error);
    }, [error]);

    return (
        <div className="flex min-h-[60vh] w-full items-center justify-center p-6">
            <div className="flex w-full max-w-md flex-col items-center gap-5 rounded-xl border bg-card p-10 text-center shadow-sm">
                <div className="flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                    <TriangleAlert className="size-7" />
                </div>

                <div className="space-y-1.5">
                    <h2 className="text-xl font-bold tracking-tight">页面出错了</h2>
                    <p className="text-sm text-muted-foreground">
                        加载页面时发生了一点问题，请重试或返回首页。
                    </p>
                    {error.digest && (
                        <p className="pt-1 font-mono text-xs text-muted-foreground/70">
                            错误标识：{error.digest}
                        </p>
                    )}
                </div>

                <div className="mt-1 flex gap-3">
                    <button
                        onClick={() => unstable_retry()}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
                    >
                        <RotateCw className="size-4" />
                        重试
                    </button>
                    <Link
                        href="/"
                        className="inline-flex items-center rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
                    >
                        返回首页
                    </Link>
                </div>
            </div>
        </div>
    );
}
