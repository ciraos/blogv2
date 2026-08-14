"use client";

import "./globals.css";
import { useEffect } from "react";
import { RotateCw, TriangleAlert } from "lucide-react";

// 根布局（layout/template）自身出错时兜底，必须自带 <html> 与 <body>
export default function GlobalError({
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
        <html lang="zh-CN" data-theme="light">
            <body className="bg-background text-foreground">
                <div className="flex min-h-screen items-center justify-center p-6">
                    <div className="flex w-full max-w-md flex-col items-center gap-5 rounded-xl border bg-card p-10 text-center shadow-sm">
                        <div className="flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                            <TriangleAlert className="size-7" />
                        </div>

                        <div className="space-y-1.5">
                            <h2 className="text-xl font-bold tracking-tight">应用遇到了问题</h2>
                            <p className="text-sm text-muted-foreground">
                                页面骨架加载失败，请刷新浏览器重试。
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
                            <button
                                onClick={() => window.location.reload()}
                                className="inline-flex items-center rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
                            >
                                刷新页面
                            </button>
                        </div>
                    </div>
                </div>
            </body>
        </html>
    );
}
