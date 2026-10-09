"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * 真·自适应瀑布流（保留「左→右、上→下」的阅读顺序，且不出现大片空洞）——纯 CSS Grid + JS 量高，无新依赖。
 *
 * 原理：
 *  1. 容器是普通 `grid`（`grid-template-columns` 由 Tailwind 的 `grid-cols-*` 决定），
 *     但把行高压到很小（`gridAutoRows: "8px"`），行只是一把「8px 的尺子」；
 *  2. 每个卡片量出自己的真实高度 h，换算成要跨多少行：
 *        span = Math.ceil((h + gap) / (rowHeight + gap))
 *     然后写 `el.style.gridRowEnd = "span " + span"`。
 *     高度是内容决定的（auto），量多少跨多少 —— 所以矮卡下方不会留洞，
 *     又因为是**行优先**自动放置，顺序仍是左→右、上→下（不像 CSS 多列那样列优先）。
 *  3. 用 ResizeObserver 监听每个卡片：卡片高度变化（数据刷新、内容换行）→ 重新量；
 *     卡片与容器的尺寸变化都会回调，因此**容器宽度变化（列数变化）时也会重算**，
 *     窗口 resize / 侧边栏折叠都覆盖到了。
 *
 * 注意：span 会向上取整，卡片实际高度由内容决定（`.masonry-item { align-self: start }` 不拉伸），
 * 所以每张卡下方最多多出 1 个行高的余量（< 8px），肉眼不可见，也不会裁内容（不用 overflow）。
 *
 * 用法：
 *   const { containerRef, register } = useMasonry();
 *   <div ref={containerRef} className="grid ..." style={{ gridAutoRows: "8px" }}>
 *     {items.map((it) => <div key={it.id} ref={register} className="masonry-item">…</div>)}
 *   </div>
 */
export function useMasonry(rowHeight = 8, gap = 12) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    /** 每张卡片一个稳定的 ref 对象（Map 顺序 = 注册顺序 = DOM 顺序，量高时按顺序处理） */
    const itemsRef = useRef(new Map<HTMLElement, { current: HTMLElement | null }>());

    /** 量一次：把每张卡的高度换算成跨行数写回（值没变就不写，避免 observer 自激） */
    const measure = () => {
        for (const ref of itemsRef.current.values()) {
            const el = ref.current;
            if (!el) continue;
            // 先清掉 span，量到的才是「内容真实高度」（否则量到的是上一次跨行后的拉伸高度）
            el.style.gridRowEnd = "";
            const h = el.getBoundingClientRect().height;
            const span = Math.max(1, Math.ceil((h + gap) / (rowHeight + gap)));
            const next = `span ${span}`;
            if (el.style.gridRowEnd !== next) el.style.gridRowEnd = next;
        }
    };

    useLayoutEffect(() => {
        measure();
        if (typeof ResizeObserver === "undefined") return;
        const ro = new ResizeObserver(() => measure());
        if (containerRef.current) ro.observe(containerRef.current);
        for (const ref of itemsRef.current.values()) if (ref.current) ro.observe(ref.current);
        return () => ro.disconnect();
    });

    /** ref 回调：注册/反注册一个卡片（Map 的键是元素本身，卸载时按元素删；返回值显式为 void） */
    const register = (el: HTMLElement | null): void => {
        const map = itemsRef.current;
        for (const [key, ref] of map) if (ref.current === el) map.delete(key);
        if (el) {
            map.set(el, { current: el });
            // 先按内容量一次，避免首帧出现未跨行的抖动（下一帧 useLayoutEffect 会统一再量）
            const h = el.getBoundingClientRect().height;
            const span = Math.max(1, Math.ceil((h + gap) / (rowHeight + gap)));
            el.style.gridRowEnd = `span ${span}`;
        }
    };

    return { containerRef, register };
}
