"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { unsubscribeByTokenApi } from "@/lib/api-subscribe";

/**
 * 退订页（邮件里 `GET /public/unsubscribe/{token}` 的落地页）。
 *
 * 访问即退订 —— token 本身是一次性的凭证，不需要二次确认（邮件已经确认过一次了）。
 * 三种状态：处理中 / 已退订 / 链接失效。
 */
export function UnsubscribeClient({ token }: { token: string }) {
    const [state, setState] = useState<"loading" | "done" | "error">("loading");
    const [message, setMessage] = useState("");

    useEffect(() => {
        let cancelled = false;
        unsubscribeByTokenApi(token)
            .then(() => {
                if (!cancelled) setState("done");
            })
            .catch((error: unknown) => {
                if (cancelled) return;
                setMessage(error instanceof Error ? error.message : "退订失败");
                setState("error");
            });
        return () => {
            cancelled = true;
        };
    }, [token]);

    return (
        <div className="mx-auto flex min-h-[50vh] w-full max-w-md flex-col items-center justify-center gap-4 px-4 py-16 text-center">
            {state === "loading" && (
                <>
                    <Loader2 className="size-7 animate-spin text-muted-foreground" aria-hidden />
                    <p className="text-sm text-muted-foreground">正在处理退订…</p>
                </>
            )}

            {state === "done" && (
                <>
                    <CheckCircle2 className="size-9 text-emerald-500" aria-hidden />
                    <h1 className="text-lg font-semibold">已退订</h1>
                    <p className="text-sm text-muted-foreground">
                        这个邮箱不会再收到新文章提醒。后悔了随时可以再订阅。
                    </p>
                    <Button asChild variant="outline" size="sm" className="mt-2">
                        <Link href="/">回到首页</Link>
                    </Button>
                </>
            )}

            {state === "error" && (
                <>
                    <TriangleAlert className="size-9 text-amber-500" aria-hidden />
                    <h1 className="text-lg font-semibold">退订失败</h1>
                    <p className="text-sm text-muted-foreground">{message || "链接可能已失效，或这个邮箱本来没有订阅。"}</p>
                    <Button asChild variant="outline" size="sm" className="mt-2">
                        <Link href="/">回到首页</Link>
                    </Button>
                </>
            )}
        </div>
    );
}
