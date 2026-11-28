"use client";

import { useEffect } from "react";

import { DEFAULT_FALLBACK_IMAGE, warnImageOnce } from "@/components/ui/safe-image";

/**
 * 全站图片兜底的「最后一道网」。
 *
 * 为什么还需要它（已经有 `SafeImage` / `CoverImage` 了）：
 *  - 正文与评论里的图片是后端直接给的 HTML 字符串，走 `dangerouslySetInnerHTML` 渲染，
 *    React 拿不到这些 `<img>` 的句柄，**没法挂 onError**；
 *  - 还有一批直接写死的 `<img>`（友链头像、音乐胶囊封面、徽章、备案图标…），一个个改造收益低。
 *
 * 手段：在 `document` 上挂**捕获阶段**的 error 监听。`error` 事件不冒泡，
 * 但捕获阶段能收到，这样任何 `<img>` 失败都会被这里接住 —— 包括 HTML 注入的那些。
 *
 * 行为：
 *  1. 把失败图的 `src` 换成 `/placeholder.svg`，并清掉 `srcset`（不清会继续用坏图）；
 *  2. `console.warn` 一次（按源地址去重），带 alt / 所在区块，便于定位；
 *  3. 占位图自己也失败（本站静态资源异常）→ 直接 `visibility:hidden`，不留裂图；
 *  4. 已经由 `SafeImage` / `CoverImage` 接管（带 `data-safe-img`）的图 **跳过**，避免两边打架。
 */
export function ImageFallbackWatcher() {
    useEffect(() => {
        const handle = (el: HTMLImageElement) => {
            if (el.dataset.safeImg === "1") return;
            if (el.dataset.imgFallbackDone === "1") return;

            const original = el.currentSrc || el.getAttribute("src") || "";
            if (!original) return;

            // 占位图自身也挂了：藏起来，别让页面上留一个裂图图标
            if (original.endsWith(DEFAULT_FALLBACK_IMAGE)) {
                el.dataset.imgFallbackDone = "1";
                el.style.visibility = "hidden";
                return;
            }

            el.dataset.imgFallbackDone = "1";

            // 用 alt + 最近的可辨识容器的标签做定位提示
            const section = el.closest("article, section, aside, header, footer, figure");
            const alt = el.alt?.trim().slice(0, 20);
            const where = [alt && `alt=${alt}`, section?.tagName.toLowerCase()].filter(Boolean).join(" / ");
            warnImageOnce(original, DEFAULT_FALLBACK_IMAGE, where || "页面图片");

            el.removeAttribute("srcset");
            el.src = DEFAULT_FALLBACK_IMAGE;
        };

        const onError = (event: Event) => {
            const target = event.target;
            if (target instanceof HTMLImageElement) handle(target);
        };

        document.addEventListener("error", onError, true);

        /**
         * 水合前就已经 404 的图：error 事件发生在监听器挂上之前，收不到。
         * 挂载后再扫一遍 DOM，以及 1.5 秒后补扫一次（懒加载图通常在这之前触发）。
         */
        const scan = () => {
            document.querySelectorAll("img").forEach((el) => {
                if (el.complete && el.naturalWidth === 0) handle(el);
            });
        };
        const first = window.setTimeout(scan, 0);
        const second = window.setTimeout(scan, 1500);

        return () => {
            document.removeEventListener("error", onError, true);
            window.clearTimeout(first);
            window.clearTimeout(second);
        };
    }, []);

    return null;
}
