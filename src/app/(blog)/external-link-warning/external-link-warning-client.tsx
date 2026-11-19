"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowUpRight, Link2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
    broadcastExternalLinkCancel,
    EXTERNAL_LINK_CANCEL_MESSAGE,
    EXTERNAL_LINK_SKIP_KEY,
} from "@/lib/external-link";

/** 自动关闭/返回的倒计时（秒） */
const COUNTDOWN = 5;

/**
 * 外链跳转提示页。
 *
 * 交互口径：
 *  · 5 秒倒计时，**结束不跳外站** —— 默认做「什么都没发生」：提示页自己关掉（新标签打开时）
 *    或退回上一页（同标签时）；原标签页会收到一条 toast 说明「没点立即前往，所以没跳转」。
 *  · 想真的过去就点「立即前往」（或勾了「记住我的选择」后整会话不再拦）。
 *  · `blank=1` 表示原链接是 target="_blank"：提示页本身被开在新标签里，
 *    所以倒计时结束/取消时优先 `window.close()`，关不掉再退回上一页。
 */
export function ExternalLinkWarningClient() {
    const params = useSearchParams();
    const router = useRouter();

    const rawUrl = params.get("url");
    // 提示页是否被单独开在一个新标签（来自 _blank 链接）
    const openedAsNewTab = params.get("blank") === "1";
    // 只放行 http(s)：防止参数里塞 javascript: 之类被点开
    const targetUrl = (() => {
        if (!rawUrl) return "";
        try {
            const decoded = decodeURIComponent(rawUrl);
            const parsed = new URL(decoded);
            return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : "";
        } catch {
            return "";
        }
    })();

    const [seconds, setSeconds] = useState(COUNTDOWN);
    const [remember, setRemember] = useState(false);
    const doneRef = useRef(false);

    /**
     * 放行：始终在**当前标签**跳到目标站。
     *
     * 从 `_blank` 链接点进来的情况，提示页本身已经被开在一个新标签里了
     * （见 lib/external-link.ts），这里再 window.open 会白开第三个标签，
     * 而且倒计时自动跳转没有用户手势，会被弹窗拦截 —— 所以一律同标签。
     */
    const leave = useCallback(() => {
        if (!targetUrl || doneRef.current) return;
        doneRef.current = true;
        if (remember) {
            try {
                sessionStorage.setItem(EXTERNAL_LINK_SKIP_KEY, "true");
            } catch {
                // 隐私模式下写不进去：忽略，下次照常提示
            }
        }
        window.location.href = targetUrl;
    }, [targetUrl, remember]);

    /**
     * 「不去了」：关标签页 / 退回上一页。
     *
     * 关不掉的兜底分两种：
     *  · 新标签：通知原标签弹 toast，然后 window.close()；浏览器只允许关「脚本打开的」标签，
     *    所以关完还活着就退回上一页；
     *  · 同标签：没法关自己，弹 toast 说明原因后退回上一页。
     */
    const stayAway = useCallback(
        (notify: boolean) => {
            if (doneRef.current) return;
            doneRef.current = true;

            const goBack = () => {
                if (window.history.length > 1) router.back();
                else router.replace("/");
            };

            if (openedAsNewTab) {
                // 通知原标签弹提示：本标签马上要被关掉，自己弹的 toast 会一起消失。
                // （同一个文档里的监听器也会收到自己发的消息，所以下面只在关不掉时才补一条本地提示）
                if (notify) broadcastExternalLinkCancel();
                try {
                    window.opener?.focus?.();
                } catch {
                    // 跨源/被限制：忽略
                }
                window.close();
                // 仍然活着 = 浏览器不让关（用户手输地址进来的等）：别把人卡在提示页
                window.setTimeout(() => {
                    toast.info(EXTERNAL_LINK_CANCEL_MESSAGE, { duration: 6000 });
                    goBack();
                }, 120);
                return;
            }

            // 同标签：不能关自己，弹一条说明后退回上一页（不要再广播，否则会弹两条）
            toast.info(EXTERNAL_LINK_CANCEL_MESSAGE, { duration: 6000 });
            window.setTimeout(goBack, 900);
        },
        [openedAsNewTab, router]
    );

    // 没有合法目标地址：回首页，避免停在空白页
    useEffect(() => {
        if (!targetUrl) router.replace("/");
    }, [targetUrl, router]);

    // 倒计时
    useEffect(() => {
        if (!targetUrl) return;
        const timer = window.setInterval(() => setSeconds((s) => (s <= 1 ? 0 : s - 1)), 1000);
        return () => window.clearInterval(timer);
    }, [targetUrl]);

    // 归零：不跳外站，关标签/退回上一页，并让原标签弹提示
    useEffect(() => {
        if (seconds === 0) stayAway(true);
    }, [seconds, stayAway]);

    if (!targetUrl) return null;

    /** 进度环角度：从 360°（满）收到 0°（归零） */
    const progressDeg = Math.max(0, Math.min(360, (seconds / COUNTDOWN) * 360));

    return (
        <div className="mx-auto flex min-h-[60vh] w-full max-w-xl items-center px-4 py-16">
            <div className="w-full soft-surface p-7">
                <div className="flex items-start gap-4">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <ShieldAlert className="size-5" />
                    </span>
                    <div className="min-w-0">
                        <h1 className="editorial-serif text-2xl font-semibold">外部站点通行确认</h1>
                        <p className="mt-1.5 text-sm text-muted-foreground">
                            即将建立站外连接。该节点内容与安全性不受本站校验。
                        </p>
                    </div>
                </div>

                <div className="mt-6 flex items-start gap-2 rounded-md border border-border/60 bg-muted/40 px-3 py-2.5">
                    <Link2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 break-all font-mono text-xs leading-relaxed text-foreground/80">
                        {targetUrl}
                    </span>
                </div>

                <label className="mt-4 flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                    <input
                        type="checkbox"
                        checked={remember}
                        onChange={(e) => setRemember(e.target.checked)}
                        className="size-3.5 accent-primary"
                    />
                    本次会话内不再校验通行
                </label>

                <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                    {/* 倒计时：进度环 + 大号数字（数字比一行小字更容易注意到） */}
                    <div className="flex items-center gap-2.5">
                        <span
                            className="relative flex size-10 shrink-0 items-center justify-center rounded-full"
                            style={{
                                background: `conic-gradient(var(--primary) ${progressDeg}deg, color-mix(in oklab, var(--foreground) 14%, transparent) 0)`,
                            }}
                            aria-hidden="true"
                        >
                            <span className="absolute inset-[2.5px] rounded-full bg-[var(--card)]" />
                            <span className="relative font-mono text-base leading-none font-semibold tabular-nums text-primary">
                                {seconds}
                            </span>
                        </span>
                        <span className="text-xs leading-relaxed text-muted-foreground">
                            {seconds > 0 ? (
                                <>
                                    <span className="sr-only">剩余 {seconds} 秒</span>
                                    秒后关闭通行窗口
                                </>
                            ) : (
                                "通行已回滚…"
                            )}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => stayAway(false)}>
                            放弃通行
                        </Button>
                        <Button size="sm" onClick={() => leave()}>
                            确认通行
                            <ArrowUpRight className="size-3.5" />
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
