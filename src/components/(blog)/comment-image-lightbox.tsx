"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, LoaderCircle, X } from "lucide-react";

/**
 * 评论区图片放大预览（lightbox）。
 *
 * 为什么单独一个文件 + createPortal 到 body：
 *  - 评论气泡那一带有 `w-fit` / `overflow-hidden` 之类的祖先，留在原地做全屏遮罩会被裁剪，
 *    也会被顶栏、浮动按钮这些 `fixed` + 高 `z-index` 的元素压住；挂到 body 上才是真正的一次性全屏层
 *    （与 `ai-podcast-button.tsx:64` 的弹窗、`essay-lightbox.tsx:43` 的说说看图器同一口径）。
 *  - 没有引任何 lightbox 依赖：遮罩就是一个 fixed 的 div，交互全靠键盘 / 指针事件。
 *
 * 图集：**同一条评论正文里的所有图片**（由 comment-content.tsx 按 DOM 顺序收集后传进来），
 * 不跨评论 —— 评论之间互相独立，跨评论切换会让人不知道自己在看哪条评论的图。
 * 只有一张图时不渲染左右箭头（也就不存在"切到别处"的困惑）。
 *
 * 关闭方式（三条，都指向同一个 onClose）：
 *  1. 点击遮罩 → 点图片也关（图片不 stopPropagation，点击冒泡到遮罩，符合"点开看原图、再点一下收起"的直觉）；
 *  2. Esc（keydown 挂在 window 上，焦点在哪都能收到）；
 *  3. 右上角关闭按钮（`aria-label="关闭"`）。
 *
 * 切换方式（四条）：左右箭头按钮、ArrowLeft/ArrowRight、移动端左右滑动（水平位移 ≥ 40px）。
 * 边界**不循环**：到头就停住（按钮同时置灰 disabled），行为比循环更可预期。
 *
 * 焦点：打开时焦点移到关闭按钮；切换时焦点留在触发切换的那个箭头上（React 复用同一个 DOM 节点，
 * 焦点不会被"切没了"）；关闭后的焦点还给**最初点击的那张缩略图**（由调用方处理，见 comment-content.tsx）。
 */

export interface CommentLightboxImage {
    /** 原图地址（与缩略图同源，只是不做任何宽度限制） */
    src: string;
    /** 沿用原 <img> 的 alt */
    alt: string;
}

interface CommentImageLightboxProps {
    images: CommentLightboxImage[];
    /** 打开时定位到第几张 */
    index: number;
    onIndexChange: (index: number) => void;
    onClose: () => void;
}

/** 移动端滑动切换的判定阈值（水平位移 ≥ 40px 且以水平方向为主） */
const SWIPE_THRESHOLD = 40;

/** 订阅挂载状态：SSR 阶段没有 document，portal 不能渲染（避免 hydration 不一致） */
const emptySubscribe = () => () => {};

function useMounted(): boolean {
    return useSyncExternalStore(
        emptySubscribe,
        () => true,
        () => false
    );
}

export function CommentImageLightbox({ images, index, onIndexChange, onClose }: CommentImageLightboxProps) {
    const mounted = useMounted();
    const closeButtonRef = useRef<HTMLButtonElement>(null);
    /** 切换后把焦点钉在触发切换的那个按钮上（键盘用户不会"掉焦点"） */
    const focusAfterChangeRef = useRef<HTMLElement | null>(null);
    const total = images.length;
    const current = images[Math.min(Math.max(index, 0), Math.max(total - 1, 0))];
    /**
     * 记「已经加载完的图片 src」，而不是一个 loaded 布尔量。
     * 为什么：`loaded` 的真假只取决于「当前这张图（current.src）加载完了没有」——
     * 它本该在渲染期算出来。原来的写法（useState(false) + `useEffect(() => setLoaded(false), [current?.src])`）
     * 是「用 effect 把 state 重置成 props/派生值」：换图后先带着上一张图的 loaded=true 渲染一次，
     * effect 里同步 setState 再触发一轮级联渲染（react-hooks/set-state-in-effect），
     * 而且这一轮里占位图标会晚一帧出现。改成比较 src 后，换图当次渲染 loaded 天然就是 false。
     */
    const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
    const currentSrc = current?.src;
    /** 当前这张图是否已经加载完成（onLoad / onError 都算「不用再转圈了」） */
    const loaded = currentSrc != null && loadedSrc === currentSrc;
    const touchStartRef = useRef<{ x: number; y: number } | null>(null);

    const prevDisabled = index <= 0;
    const nextDisabled = index >= total - 1;

    const goPrev = useCallback(() => {
        if (index > 0) onIndexChange(index - 1);
    }, [index, onIndexChange]);

    const goNext = useCallback(() => {
        if (index < total - 1) onIndexChange(index + 1);
    }, [index, total, onIndexChange]);

    // 滚动锁定 + Esc / 方向键
    useEffect(() => {
        const previousOverflow = document.body.style.overflow;
        const previousPaddingRight = document.body.style.paddingRight;
        // 隐藏 body 滚动条会让整页横向抖一下，用等宽的 padding 顶住（滚动条宽度取运行值）
        const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
        document.body.style.overflow = "hidden";
        if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.stopPropagation();
                onClose();
                return;
            }
            if (event.key === "ArrowLeft") {
                event.preventDefault();
                focusAfterChangeRef.current = null;
                goPrev();
            }
            if (event.key === "ArrowRight") {
                event.preventDefault();
                focusAfterChangeRef.current = null;
                goNext();
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => {
            window.removeEventListener("keydown", onKeyDown);
            document.body.style.overflow = previousOverflow;
            document.body.style.paddingRight = previousPaddingRight;
        };
    }, [onClose, goPrev, goNext]);

     // 打开时把焦点移进对话框（读屏用户下次 Tab 就从关闭按钮开始）。
    // ⚠️ 只在"还没有焦点在对话框内"时抢焦点：切换图片会重跑本 effect，
    //    若无条件 focus() 会把键盘用户从箭头按钮上拽走（与下面的 focusAfterChange 打架）。
    //    依赖里带上 index：评论正文重建导致重新挂载时也能补回焦点，不会掉到 body 上。
    useEffect(() => {
        const active = document.activeElement;
        if (!active || active === document.body) closeButtonRef.current?.focus();
    }, [index]);

    // 切换后把焦点放回箭头按钮（只在"点了箭头"这条路径上；键盘切换不必抢焦点）
    useEffect(() => {
        focusAfterChangeRef.current?.focus({ preventScroll: true });
        focusAfterChangeRef.current = null;
    }, [index]);

    if (!mounted || !current) return null;

    const arrowClass =
        "pointer-events-auto flex size-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/25 disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

    return createPortal(
        <div
            role="dialog"
            aria-modal="true"
            aria-label="图片预览"
            data-comment-image-lightbox=""
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-4"
            onClick={onClose}
            onTouchStart={(event) => {
                const touch = event.touches[0];
                touchStartRef.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
            }}
            onTouchEnd={(event) => {
                const start = touchStartRef.current;
                touchStartRef.current = null;
                const touch = event.changedTouches[0];
                if (!start || !touch) return;
                const dx = touch.clientX - start.x;
                const dy = touch.clientY - start.y;
                // 以横向为主、且位移够大才算滑动，避免把纵向滚动/误触当成切图
                if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) < Math.abs(dy)) return;
                if (dx > 0) goPrev();
                else goNext();
            }}
        >
            <button
                ref={closeButtonRef}
                type="button"
                aria-label="关闭"
                onClick={(event) => {
                    event.stopPropagation();
                    onClose();
                }}
                className="absolute right-3 top-3 z-10 rounded-full bg-white/10 p-2.5 text-white transition-colors hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:right-5 sm:top-5"
            >
                <X className="size-5" aria-hidden />
            </button>

            {/* 序号角标：切换时同步更新（aria-live 让读屏也能听到"第几张"） */}
            {total > 1 && (
                <div
                    data-comment-image-counter=""
                    aria-live="polite"
                    className="absolute left-3 top-3 z-10 rounded-full bg-black/50 px-3 py-1.5 text-xs text-white/90 sm:left-5 sm:top-5"
                >
                    {index + 1} / {total}
                </div>
            )}

            {/* 左右箭头：只有一张图时整块不渲染。两侧各留 64px 热区（移动端点得到） */}
            {total > 1 && (
                <div className="pointer-events-none absolute inset-y-0 left-0 z-10 flex w-16 items-center justify-center">
                    <button
                        type="button"
                        aria-label="上一张"
                        disabled={prevDisabled}
                        onClick={(event) => {
                            event.stopPropagation();
                            focusAfterChangeRef.current = event.currentTarget;
                            goPrev();
                        }}
                        className={arrowClass}
                    >
                        <ChevronLeft className="size-6" aria-hidden />
                    </button>
                </div>
            )}
            {total > 1 && (
                <div className="pointer-events-none absolute inset-y-0 right-0 z-10 flex w-16 items-center justify-center">
                    <button
                        type="button"
                        aria-label="下一张"
                        disabled={nextDisabled}
                        onClick={(event) => {
                            event.stopPropagation();
                            focusAfterChangeRef.current = event.currentTarget;
                            goNext();
                        }}
                        className={arrowClass}
                    >
                        <ChevronRight className="size-6" aria-hidden />
                    </button>
                </div>
            )}

            {/* 主图：点击冒泡到遮罩 → 关闭 */}
            {!loaded && (
                <div className="pointer-events-none absolute flex flex-col items-center gap-2 text-white/70">
                    <LoaderCircle className="size-6 animate-spin" aria-hidden />
                    <span className="text-xs">原图加载中…</span>
                </div>
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                key={current.src}
                src={current.src}
                alt={current.alt}
                onLoad={() => setLoadedSrc(current.src)}
                onError={() => setLoadedSrc(current.src)}
                className={`block max-h-[90vh] max-w-[92vw] rounded-md object-contain shadow-2xl transition-opacity duration-200 ${
                    loaded ? "opacity-100" : "opacity-0"
                }`}
            />
        </div>,
        document.body
    );
}
