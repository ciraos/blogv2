"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";

import { impactsWholeDocument, subscribeSiteConfigUpdates } from "@/lib/site-config-broadcast";

/** 兜底轮询间隔：站点配置走广播（几乎即时），文章/评论/随笔这类内容变更靠这个窗口。 */
const POLL_INTERVAL_MS = 60_000;

/** 窗口/标签页「回来」时，距上次刷新超过该间隔才刷，避免来回切换疯狂重取。 */
const WAKE_REFRESH_MIN_GAP_MS = 15_000;

/** 两次刷新之间的最小间隔：广播、轮询、唤醒三者叠加时只刷一次。 */
const REFRESH_COOLDOWN_MS = 5_000;

/**
 * 用户正在输入（焦点在表单元素且有内容）时不要整页刷新，否则会连人带草稿一起刷掉。
 * 这种时候退化成 router.refresh()：能拿到新数据，客户端 state（输入内容）保留。
 */
function isTypingWithContent(): boolean {
    const el = typeof document === "undefined" ? null : document.activeElement;
    if (!el) return false;
    if (el instanceof HTMLTextAreaElement) return el.value.trim() !== "";
    if (el instanceof HTMLInputElement) {
        const type = el.type;
        if (type === "checkbox" || type === "radio" || type === "button" || type === "submit" || type === "file") {
            return false;
        }
        return el.value.trim() !== "";
    }
    if (el instanceof HTMLElement && el.isContentEditable) return el.innerText.trim() !== "";
    return false;
}

/**
 * 前台「活着」的刷新器：挂在 (blog) 布局内（不渲染任何 DOM，与 auth-expired-notifier 同类）。
 *
 * 两条触发路径：
 *  1) 站点配置广播（后台系统设置保存 → 同一浏览器其它标签页）：影响整站外观的键整页 reload，
 *     其余键 router.refresh()。边界说明见 lib/site-config-broadcast.ts；
 *  2) 兜底刷新：页面可见时每 POLL_INTERVAL_MS 一次，以及从别的标签页/窗口切回来、
 *     或从 bfcache 恢复时（带最小间隔与冷却），补上文章、评论、随笔等**内容**变更 ——
 *     这些内容后端不会广播，只能靠这里拉。
 *
 * router.refresh() 只重跑服务端组件、保留客户端 state（输入框、弹窗、分页选择都不会被重置），
 * 所以定时刷新不会打断用户正在写的评论。
 */
export function LiveRefresher({ poll = true }: { poll?: boolean }) {
    const router = useRouter();
    const [, startTransition] = useTransition();
    const lastRefreshAt = useRef(0);
    const refreshingRef = useRef(false);

    useEffect(() => {
        let disposed = false;

        const refresh = () => {
            if (disposed || refreshingRef.current) return;
            const now = Date.now();
            if (now - lastRefreshAt.current < REFRESH_COOLDOWN_MS) return;
            lastRefreshAt.current = now;
            refreshingRef.current = true;
            startTransition(() => router.refresh());
            // transition 的结束时机在这里拿不到，给一个够下一次触发到来的释放窗口
            window.setTimeout(() => {
                refreshingRef.current = false;
            }, REFRESH_COOLDOWN_MS);
        };

        // 路径 1：站点配置广播
        const unsubscribe = subscribeSiteConfigUpdates(({ updatedKeys }) => {
            if (impactsWholeDocument(updatedKeys) && !isTypingWithContent()) {
                window.location.reload();
                return;
            }
            refresh();
        });

        // 路径 2：兜底刷新
        const wake = () => {
            if (document.visibilityState !== "visible") return;
            if (Date.now() - lastRefreshAt.current < WAKE_REFRESH_MIN_GAP_MS) return;
            refresh();
        };
        // 只有「窗口先失焦再回来」才算唤醒：避免页面内点击元素冒泡上来的 focus 事件也触发
        let blurred = false;
        const onBlur = () => {
            blurred = true;
        };
        const onFocus = () => {
            if (!blurred) return;
            blurred = false;
            wake();
        };
        // 从 bfcache 恢复的页面整体可能是旧的，按「醒来」处理
        const onPageShow = (event: PageTransitionEvent) => {
            if (event.persisted) wake();
        };

        const timer = poll
            ? window.setInterval(() => {
                  if (document.visibilityState === "visible") refresh();
              }, POLL_INTERVAL_MS)
            : null;

        document.addEventListener("visibilitychange", wake);
        window.addEventListener("blur", onBlur);
        window.addEventListener("focus", onFocus);
        window.addEventListener("pageshow", onPageShow);
        lastRefreshAt.current = Date.now(); // 刚进页面，不立刻再刷一次

        return () => {
            disposed = true;
            unsubscribe();
            if (timer !== null) window.clearInterval(timer);
            document.removeEventListener("visibilitychange", wake);
            window.removeEventListener("blur", onBlur);
            window.removeEventListener("focus", onFocus);
            window.removeEventListener("pageshow", onPageShow);
        };
    }, [poll, router, startTransition]);

    return null;
}
