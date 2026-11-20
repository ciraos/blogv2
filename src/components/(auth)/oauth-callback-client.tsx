"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Loader2, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

/** 与 oauth-buttons 里记的 key 对应 */
const STATE_KEY = "blog:oauth-state";

/**
 * 第三方登录回调页（`/callback/{provider}`）。
 *
 * 服务商授权后会带着 `?code=&state=` 回到这里：
 *  1. 校验 state（Rainbow 聚合登录不带 state，跳过）；
 *  2. 调本站同源路由 `/api/pro/oauth/{provider}/callback` 换 token —— **token 由服务端写进
 *     httpOnly cookie，不会经过这里**；
 *  3. 成功 → 进后台；需要绑定 → 提示后回登录页。
 */
export function OAuthCallbackClient({ provider }: { provider: string }) {
    const router = useRouter();
    const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
    const [message, setMessage] = useState("");
    const processed = useRef(false);

    const finish = useCallback((next: "success" | "error", text: string) => {
        setStatus(next);
        setMessage(text);
    }, []);

    const run = useCallback(async () => {
        const params = new URLSearchParams(window.location.search);
        const code = params.get("code");
        const state = params.get("state") ?? "";
        const type = params.get("type") ?? undefined;

        if (!code) {
            finish("error", "缺少授权码参数，可能是授权被取消或链接已过期。");
            return;
        }

        const isRainbow = provider === "rainbow";
        if (!isRainbow) {
            try {
                const saved = sessionStorage.getItem(STATE_KEY);
                if (saved && state !== saved) {
                    finish("error", "状态校验失败，可能是安全风险，请重新登录。");
                    return;
                }
            } catch {
                // 隐私模式：跳过这层校验
            }
        }

        const query = new URLSearchParams();
        query.set("code", code);
        if (!isRainbow && state) query.set("state", state);
        if (isRainbow && type) query.set("type", type);

        try {
            const res = await fetch(`/api/pro/oauth/${provider}/callback?${query.toString()}`, {
                method: "GET",
                cache: "no-store",
            });
            const json = (await res.json()) as {
                code?: number;
                message?: string;
                data?: { need_binding?: boolean; is_new_user?: boolean };
            };

            if (!res.ok || json.code !== 200) {
                finish("error", json.message || "第三方登录失败，请重试。");
                return;
            }
            if (json.data?.need_binding) {
                finish("error", "该第三方账号还没有绑定本站账号，请先用邮箱密码登录后再绑定。");
                return;
            }

            finish("success", json.data?.is_new_user ? "注册并登录成功，正在进入后台…" : "登录成功，正在进入后台…");
            window.setTimeout(() => router.replace("/admin/dashboard"), 800);
        } catch {
            finish("error", "网络异常，第三方登录未完成。");
        }
    }, [provider, router, finish]);

    useEffect(() => {
        // StrictMode 下 effect 会跑两次，用 ref 挡掉第二次（否则 code 会被用两遍）
        if (processed.current) return;
        processed.current = true;
        // 宏任务里再跑：effect 内同步 setState 会被 react-hooks/set-state-in-effect 拦
        const timer = window.setTimeout(() => void run(), 0);
        return () => window.clearTimeout(timer);
    }, [run]);

    return (
        <div className="mx-auto flex min-h-[60vh] w-full max-w-sm flex-col items-center justify-center gap-3 text-center">
            {status === "loading" && (
                <>
                    <Loader2 className="size-7 animate-spin text-muted-foreground" aria-hidden />
                    <p className="text-sm text-muted-foreground">正在完成第三方登录…</p>
                </>
            )}
            {status === "success" && (
                <>
                    <CheckCircle2 className="size-9 text-emerald-500" aria-hidden />
                    <p className="text-sm">{message || "登录成功"}</p>
                </>
            )}
            {status === "error" && (
                <>
                    <TriangleAlert className="size-9 text-amber-500" aria-hidden />
                    <p className="text-sm text-muted-foreground">{message}</p>
                    <Button asChild variant="outline" size="sm" className="mt-2">
                        <Link href="/login">回到登录页</Link>
                    </Button>
                </>
            )}
        </div>
    );
}
