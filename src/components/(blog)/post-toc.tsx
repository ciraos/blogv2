"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

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
    // 上次收集结果缓存：内容没变化时不重复 setState（observer 触发很频繁）
    const itemsRef = useRef<TocItem[]>([]);
    // 客户端路由判断：软导航（文章→首页）时服务端 x-pathname 可能不更新，
    // 这里用 usePathname 兜底，离开文章页立即隐藏目录
    const pathname = usePathname();
    const isPost = /^\/posts\/[^/]+$/.test(pathname);

    /** 从 .article-body 收集标题（跳过标题里的 # 锚点和 h1）。
     *  标题 id 由 ArticleBody 水合后客户端生成，正文也可能在流式渲染后才插入，
     *  因此本函数会被多次调用，幂等：内容未变化时不更新 state。 */
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
        const prev = itemsRef.current;
        const same =
            prev.length === items.length && prev.every((it, i) => it.id === items[i].id && it.text === items[i].text);
        if (same) return;
        itemsRef.current = items;
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

    // 收集时机：
    // 1. 挂载后立即尝试一次（SSR 首屏正文已在 DOM，但标题 id 可能尚未生成）
    // 2. MutationObserver 监听正文 DOM：标题 id 生成、正文插入、软导航文章切换都会触发
    //    （debounce 后收集，避免频繁重渲染）
    // 3. 滚动兜底：正文已就绪但目录仍为空时重试（不依赖 listRef，避免空目录死锁）
    useEffect(() => {
        // 非文章页不收集、不监听（PostToc 始终渲染但仅在 /posts/ 下工作）
        if (!isPost) return;
        collectToc();

        let timer: ReturnType<typeof setTimeout> | undefined;
        const observer = new MutationObserver(() => {
            clearTimeout(timer);
            timer = setTimeout(collectToc, 120);
        });
        observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["id"] });

        const onScroll = () => {
            // 正文已出现但目录仍为空 → 重试收集（修复空目录时 listRef 为 null 导致的死锁）
            if (itemsRef.current.length === 0 && document.querySelector(".article-body")) {
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
            // 只更新高亮，不做 scrollIntoView 跟随——
            // 侧边栏不是滚动容器，scrollIntoView 会滚动整个页面，与用户滚动冲突（页面被拽住）
            setActiveId((prev) => (current === prev ? prev : current));
        };
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => {
            clearTimeout(timer);
            observer.disconnect();
            window.removeEventListener("scroll", onScroll);
        };
    }, [collectToc, isPost]);

    if (!isPost || tocItems.length === 0) return null;

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

            {/* 目录列表：扁平列表，h2 与 h3 缩进区分，当前项高亮；目录过长时容器内滚动 */}
            <div ref={listRef} className="no-scrollbar max-h-[55vh] overflow-y-auto rounded-lg pr-1">
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
