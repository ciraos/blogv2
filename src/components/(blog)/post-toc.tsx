"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface TocItem {
    id: string;
    text: string;
    level: number;
}

/** PC 端文章右侧常驻目录（sticky 跟随滚动），仅 /posts/ 页面渲染 */
export function PostToc() {
    const [tocItems, setTocItems] = useState<TocItem[]>([]);
    const [activeId, setActiveId] = useState<string>("");
    const listRef = useRef<HTMLDivElement | null>(null);

    /** 从 .article-body 收集标题（跳过标题里的 # 锚点和 h1） */
    const collectToc = useCallback(() => {
        const body = document.querySelector(".article-body");
        if (!body) return;
        const items: TocItem[] = [];
        body.querySelectorAll<HTMLElement>("h2, h3").forEach((heading) => {
            if (heading.closest("pre")) return;
            if (!heading.id) return;
            const text = Array.from(heading.childNodes)
                .filter((node) => !(node instanceof HTMLElement) || !node.classList.contains("heading-anchor"))
                .map((node) => node.textContent ?? "")
                .join("")
                .trim();
            if (!text) return;
            const level = heading.tagName === "H2" ? 2 : 3;
            items.push({ id: heading.id, text, level });
        });
        setTocItems(items);
    }, []);

    /** 点击目录项滚动到标题，并同步 URL hash（锚点可分享） */
    const scrollToHeading = useCallback((id: string) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        history.replaceState(null, "", `#${id}`);
        setActiveId(id);
    }, []);

    // 首次渲染收集 + 监听滚动高亮 + 当前项自动滚入可视区
    useEffect(() => {
        const timer = setTimeout(collectToc, 100);
        const onScroll = () => {
            if (listRef.current && !listRef.current.querySelector("[data-toc-id]")) {
                collectToc();
            }
            const els = listRef.current?.querySelectorAll<HTMLElement>("[data-toc-id]");
            if (!els || els.length === 0) return;
            let current = "";
            for (const el of els) {
                const heading = document.getElementById(el.dataset.tocId || "");
                if (heading && heading.getBoundingClientRect().top <= 100) {
                    current = el.dataset.tocId || "";
                }
            }
            if (!current && els.length > 0) {
                current = els[els.length - 1].dataset.tocId || "";
            }
            if (current !== activeId) {
                setActiveId(current);
                const activeEl = listRef.current?.querySelector<HTMLElement>(`[data-toc-id="${current}"]`);
                activeEl?.scrollIntoView({ block: "nearest" });
            }
        };
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => {
            clearTimeout(timer);
            window.removeEventListener("scroll", onScroll);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeId]);

    if (tocItems.length === 0) return null;

    return (
        <div className="rounded-xl border bg-card p-5 shadow-sm">
            {/* 标题：渐变小徽章 + 文字 */}
            <div className="mb-3 flex items-center gap-2">
                <span className="flex size-6 items-center justify-center rounded-md bg-linear-to-br from-pink-500 to-indigo-500 text-white shadow-sm">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 6h16" />
                        <path d="M4 12h16" />
                        <path d="M4 18h10" />
                    </svg>
                </span>
                <span className="text-sm font-semibold tracking-tight">文章目录</span>
            </div>

            {/* 目录列表：扁平列表，h2 与 h3 缩进区分，当前项高亮 */}
            <div ref={listRef} className="rounded-lg">
                <ul className="space-y-0.5">
                    {tocItems.map((item) => (
                        <li key={item.id}>
                            <button
                                type="button"
                                data-toc-id={item.id}
                                onClick={() => scrollToHeading(item.id)}
                                className={`relative block w-full truncate rounded-md py-1.5 pr-2 text-left transition-colors ${
                                    item.level === 2 ? "pl-3 text-[13px] font-medium" : "pl-8 text-xs"
                                } ${
                                    activeId === item.id
                                        ? "bg-linear-to-r from-primary/10 to-transparent text-primary"
                                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                }`}
                            >
                                {/* 当前项左侧指示条 */}
                                <span
                                    className={`absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-primary transition-all duration-200 ${
                                        activeId === item.id ? "opacity-100" : "opacity-0"
                                    }`}
                                />
                                {item.text}
                            </button>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}
