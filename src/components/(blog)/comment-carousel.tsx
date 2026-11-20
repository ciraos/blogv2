"use client";

import { useEffect, useRef, useState } from "react";
import { Crown, MessageSquareQuote, X } from "lucide-react";

export interface CommentCarouselItem {
    id: string;
    nickname: string;
    /** 纯文本内容（已剥掉 Markdown 记号），只用来显示摘要 */
    content: string;
    /** 博主评论：角标标记 */
    isAdmin: boolean;
}

/** 每条停留时长（毫秒） */
const INTERVAL_MS = 5200;
/** 关闭后本次会话不再出现（reload 也不再弹，换页面才重置） */
const DISMISS_KEY = "blog:comment-carousel-dismissed";

/**
 * 右下角「评论轮播」。
 *
 * 定位：文章页右下角一张小卡，循环展示最近几条评论的摘要（不是弹窗、也不接管正文里的评论区）。
 * 作用是把评论「露出来」—— 大多数读者根本滚不到文末评论区。
 *
 * 交互：
 *  · 每 5.2 秒换一条，淡入淡出；鼠标悬停暂停；
 *  · 点击卡片 → 滚到 `#post-comment`（正文评论区），自己关掉；
 *  · ✕ 关闭后写 sessionStorage，本次会话不再出现；
 *  · 系统开了「减少动态效果」就不自动轮播，只显示当前这条（可以点右侧圆点手动切换）。
 */
export function CommentCarousel({ items }: { items: CommentCarouselItem[] }) {
    const [index, setIndex] = useState(0);
    const [dismissed, setDismissed] = useState(true); // 先按关闭处理，挂载后读 sessionStorage 再决定
    const [paused, setPaused] = useState(false);
    const [reduceMotion, setReduceMotion] = useState(false);
    const timer = useRef<number | null>(null);

    // 首屏先按「已关闭」渲染（SSR 与首次客户端渲染一致，不会有 hydration 差异），
    // 挂载后再读 sessionStorage 决定要不要出现；用宏任务包裹初始 setState，避免
    // react-hooks/set-state-in-effect 报「effect 内同步 setState」。
    useEffect(() => {
        let cancelled = false;
        const timer = window.setTimeout(() => {
            if (cancelled) return;
            try {
                setDismissed(sessionStorage.getItem(DISMISS_KEY) === "1");
            } catch {
                setDismissed(false);
            }
            setReduceMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
        }, 0);
        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, []);

    // 自动轮播：暂停 / 只剩一条 / 减少动态效果时不走
    useEffect(() => {
        if (dismissed || paused || items.length <= 1 || reduceMotion) return;
        timer.current = window.setInterval(() => {
            setIndex((i) => (i + 1) % items.length);
        }, INTERVAL_MS);
        return () => {
            if (timer.current !== null) window.clearInterval(timer.current);
        };
    }, [dismissed, paused, items.length, reduceMotion]);

    if (items.length === 0 || dismissed) return null;

    const current = items[Math.min(index, items.length - 1)];

    const dismiss = () => {
        setDismissed(true);
        try {
            sessionStorage.setItem(DISMISS_KEY, "1");
        } catch {
            // 隐私模式：忽略，下次刷新还会出现
        }
    };

   /** 点击卡片：滚到正文评论区（不打开任何弹窗） */
    const jumpToComments = () => {
        document.getElementById("post-comment")?.scrollIntoView({ behavior: "smooth", block: "start" });
        dismiss();
    };

    // 位置：桌面端贴在右下角悬浮按钮组的**左边**（那组在 right-5、按钮约 40~48px 宽，
    // 所以留 right-20 的间距）；移动端没那么宽，改到按钮组**上方**（bottom-28 = 112px，
    // 刚好高过 40px 按钮 + 间距），否则会和 + 按钮、左下角 AI 入口叠在一起。
    return (
        <div
            className="fixed right-4 bottom-28 z-40 w-[min(88vw,300px)] sm:right-20 sm:bottom-4 sm:w-[min(70vw,300px)]"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
        >
            <div className="relative rounded-xl border border-border/70 bg-popover/95 p-3 shadow-xl backdrop-blur-md">
                <button
                    type="button"
                    onClick={dismiss}
                    aria-label="不再显示评论轮播"
                    className="absolute right-1.5 top-1.5 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                    <X className="size-3" aria-hidden />
                </button>

                <button
                    type="button"
                    onClick={jumpToComments}
                    className="block w-full text-left"
                    title="跳到评论区"
                >
                    <div className="flex items-center gap-1.5 pr-6 text-[11px] text-muted-foreground">
                        <MessageSquareQuote className="size-3.5 shrink-0 text-primary" aria-hidden />
                        <span className="truncate font-medium text-foreground/80">{current.nickname}</span>
                        {current.isAdmin && (
                            <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-amber-500/15 px-1 py-px text-[10px] font-medium text-amber-600 dark:text-amber-400">
                                <Crown className="size-2.5" aria-hidden />
                                博主
                            </span>
                        )}
                        <span className="ml-auto shrink-0 tabular-nums">
                            {(index % items.length) + 1}/{items.length}
                        </span>
                    </div>
                    <p
                        key={current.id}
                        className="mt-1.5 line-clamp-3 text-[12px] leading-relaxed text-foreground/85 transition-opacity duration-500"
                    >
                        {current.content}
                    </p>
                </button>

                {/* 指示点：可手动切换（减少动态效果时这是唯一的切换方式） */}
                <div className="mt-2 flex items-center gap-1">
                    {items.slice(0, 8).map((item, i) => (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => setIndex(i)}
                            aria-label={`第 ${i + 1} 条评论`}
                            className={`h-1 rounded-full transition-all ${
                                i === index % items.length ? "w-4 bg-primary" : "w-1.5 bg-foreground/20 hover:bg-foreground/40"
                            }`}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}
