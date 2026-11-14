"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowUpRight, Link2, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EXTERNAL_LINK_SKIP_KEY } from "@/lib/external-link";

/** 自动跳转倒计时（秒），与官方主题一致 */
const COUNTDOWN = 5;

/**
 * 外链跳转提示页。
 *
 * 交互照 anheyu 原版：显示目标地址 + 5 秒倒计时自动前往，可「取消」（回上一页）或
 * 「立即前往」，勾选「记住我的选择」则本次会话内不再提示。
 *
 * 参数 `blank=1` 表示原链接是 target="_blank"：这种链接的提示页本身会被开在新标签里，
 * 所以「取消」应当关掉这个标签，而不是回退历史。
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

    // 归零后自动前往（同标签，避免无手势 window.open 被弹窗拦截）
    useEffect(() => {
        if (seconds === 0) leave();
    }, [seconds, leave]);

    /**
     * 取消：新标签打开的就关掉它（`window.close` 只对脚本打开的标签有效，
     * 失败时退回到首页）；同标签打开的则回退历史。
     */
    const cancel = () => {
        doneRef.current = true;
        if (openedAsNewTab) {
            window.close();
            // 关不掉（比如用户手动粘贴过地址）：别把标签卡在提示页
            router.replace("/");
            return;
        }
        if (window.history.length > 1) router.back();
        else router.replace("/");
    };

    if (!targetUrl) return null;

    return (
        <div className="mx-auto flex min-h-[60vh] w-full max-w-xl items-center px-4 py-16">
            <div className="w-full soft-surface p-7">
                <div className="flex items-start gap-4">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <ShieldAlert className="size-5" />
                    </span>
                    <div className="min-w-0">
                        <h1 className="editorial-serif text-2xl font-semibold">即将离开本站</h1>
                        <p className="mt-1.5 text-sm text-muted-foreground">
                            你正在访问外部链接，本站不对该网站的内容与安全性负责。
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
                    记住我的选择（本次会话内不再提示）
                </label>

                <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                        {seconds > 0 ? `${seconds} 秒后自动前往` : "正在前往…"}
                    </span>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={cancel}>
                            取消
                        </Button>
                        <Button size="sm" onClick={() => leave()}>
                            立即前往
                            <ArrowUpRight className="size-3.5" />
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
