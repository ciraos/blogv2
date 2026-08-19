"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { ArrowUp, ListTree, Moon, Plus, Sun } from "lucide-react";

interface TocItem {
    id: string;
    text: string;
    level: number;
}

/** (blog) 全局右下角悬浮按钮（自下而上：触发器 → 回到顶部 → 目录 → 操作组）：
 *  - 深浅色切换 + 繁简转换：藏在触发器展开组里
 *  - 外层触发器：常驻最底部，点击展开/收起操作组
 *  - 目录按钮：仅移动端文章页直接显示（PC 端有右侧常驻目录）
 *  - 回到顶部：页面顶部隐藏（不占位，上方按钮下移），下滑后显示
 */
export function FloatingActions() {
    const pathname = usePathname();
    const isPostPage = pathname.startsWith("/posts/");
    const { setTheme } = useTheme();

    const [groupOpen, setGroupOpen] = useState(false);
    const [tocOpen, setTocOpen] = useState(false);
    const [showTop, setShowTop] = useState(false);
    // 繁简状态（仅按钮 UI，转换逻辑后续接入）
    const [lang, setLang] = useState<"cn" | "tw">("cn");
    const [tocItems, setTocItems] = useState<TocItem[]>([]);
    const [activeId, setActiveId] = useState<string>("");
    const tocRef = useRef<HTMLDivElement | null>(null);

    /** 回到顶部（收起目录与展开组） */
    const scrollToTop = useCallback(() => {
        setTocOpen(false);
        setGroupOpen(false);
        window.scrollTo({ top: 0, behavior: "smooth" });
    }, []);

    /** 收集文章标题生成目录（.article-body 内 h2/h3，跳过 # 锚点） */
    const collectToc = useCallback(() => {
        const body = document.querySelector(".article-body");
        if (!body) return;
        const items: TocItem[] = [];
        body.querySelectorAll<HTMLElement>("h2, h3, h4, h5, h6").forEach((heading) => {
            if (heading.closest("pre")) return;
            if (!heading.id) return;
            const text = Array.from(heading.childNodes)
                .filter((node) => !(node instanceof HTMLElement) || !node.classList.contains("heading-anchor"))
                .map((node) => node.textContent ?? "")
                .join("")
                .trim();
            if (!text) return;
            items.push({ id: heading.id, text, level: heading.tagName === "H2" ? 2 : 3 });
        });
        setTocItems(items);
    }, []);

    /** 点击目录项滚动到标题，并同步 URL hash */
    const scrollToHeading = useCallback((id: string) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        history.replaceState(null, "", `#${id}`);
        setActiveId(id);
    }, []);

    /** 滚动监听：回到顶部显隐 + 目录滚动高亮 */
    useEffect(() => {
        const onScroll = () => {
            setShowTop(window.scrollY > 150);
            if (tocOpen && tocRef.current) {
                const headings = tocRef.current.querySelectorAll<HTMLElement>("[data-toc-id]");
                let current = "";
                for (const h of headings) {
                    const el = document.getElementById(h.dataset.tocId || "");
                    if (el && el.getBoundingClientRect().top <= 100) {
                        current = h.dataset.tocId || "";
                    }
                }
                if (!current && headings.length > 0) {
                    current = headings[headings.length - 1].dataset.tocId || "";
                }
                setActiveId(current);
            }
        };
        onScroll();
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, [tocOpen]);

    /** 目录面板打开时收集标题 */
    useEffect(() => {
        if (tocOpen && isPostPage && tocItems.length === 0) {
            const timer = setTimeout(collectToc, 50);
            return () => clearTimeout(timer);
        }
    }, [tocOpen, isPostPage, tocItems.length, collectToc]);

    /** 点击其它区域自动收起目录 */
    useEffect(() => {
        if (!tocOpen) return;
        const onPointerDown = (e: PointerEvent) => {
            const target = e.target as Node;
            if (tocRef.current?.contains(target)) return;
            setTocOpen(false);
        };
        document.addEventListener("pointerdown", onPointerDown);
        return () => document.removeEventListener("pointerdown", onPointerDown);
    }, [tocOpen]);

    /** 切换路由时重置状态（延迟到渲染后，避免 effect 内同步 setState） */
    useEffect(() => {
        const timer = setTimeout(() => {
            setGroupOpen(false);
            setTocOpen(false);
        }, 0);
        return () => clearTimeout(timer);
    }, [pathname]);

    const toggleGroup = () => {
        setGroupOpen((v) => !v);
        if (groupOpen) setTocOpen(false);
    };

    return (
        <div className="fixed bottom-3 right-3 z-50 flex flex-col items-end gap-3">

            {/* 操作组（藏在触发器展开组里，全端）：深浅色切换 + 繁简转换 */}
            <div
                className={`flex flex-col items-end gap-3 transition-all duration-300 ${groupOpen ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"
                    }`}
            >
                {/* 深浅色切换（图标/高亮用 CSS dark: 变体切换，避免 useTheme 导致 SSR/客户端水合不一致） */}
                <button
                    type="button"
                    onClick={() => setTheme(document.documentElement.classList.contains("dark") ? "light" : "dark")}
                    aria-label="深浅色切换"
                    title="切换深浅色"
                    className="flex size-10 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-lg backdrop-blur transition-colors hover:border-primary hover:text-primary dark:border-primary dark:bg-primary dark:text-primary-foreground"
                >
                    <Sun className="size-4 dark:hidden" />
                    <Moon className="hidden size-4 dark:block" />
                </button>

                {/* 繁简转换 */}
                <button
                    type="button"
                    onClick={() => setLang((v) => (v === "cn" ? "tw" : "cn"))}
                    aria-label="繁简转换"
                    title={lang === "cn" ? "转换为繁体" : "转换为简体"}
                    className={`flex size-10 items-center justify-center rounded-full border shadow-lg backdrop-blur transition-colors ${lang === "tw"
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-foreground hover:border-primary hover:text-primary"
                        }`}
                >
                    <span className="text-sm font-bold">{lang === "cn" ? "繁" : "简"}</span>
                </button>
            </div>

            {/* 外层触发器（最底部常驻，点击展开/收起繁简组） */}
            <button
                type="button"
                onClick={toggleGroup}
                aria-label={groupOpen ? "收起操作按钮" : "展开操作按钮"}
                title={groupOpen ? "收起" : "展开"}
                className={`flex size-10 items-center justify-center rounded-full border shadow-lg backdrop-blur transition-all duration-300 ${groupOpen
                    ? "rotate-45 border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-foreground hover:border-primary hover:text-primary"
                    }`}
            >
                <Plus className="size-4" />
            </button>

            {/* 目录面板（移动端弹出） */}
            {tocOpen && isPostPage && (
                <div
                    ref={tocRef}
                    className="max-h-72 w-60 max-w-[calc(100vw-2.5rem)] overflow-y-auto rounded-xl border bg-card/95 p-3 shadow-xl backdrop-blur lg:hidden"
                >
                    <div className="mb-2 px-1 text-xs font-semibold text-muted-foreground">目录</div>
                    <ul className="space-y-0.5">
                        {tocItems.map((item) => (
                            <li key={item.id}>
                                <button
                                    type="button"
                                    data-toc-id={item.id}
                                    onClick={() => scrollToHeading(item.id)}
                                    className={`block w-full truncate rounded-md px-2 py-1.5 text-left text-sm transition-colors ${item.level === 2 ? "pl-4" : "pl-7 text-xs"
                                        } ${activeId === item.id
                                            ? "bg-primary/10 text-primary"
                                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                        }`}
                                >
                                    {item.text}
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* 目录按钮（仅移动端文章页，直接显示，位于回到顶部上方） */}
            {isPostPage && (
                <button
                    type="button"
                    onClick={() => setTocOpen((v) => !v)}
                    aria-label="文章目录"
                    title={tocOpen ? "收起目录" : "文章目录"}
                    className={`flex size-10 items-center justify-center rounded-full border shadow-lg backdrop-blur transition-colors lg:hidden ${tocOpen
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-foreground hover:border-primary hover:text-primary"
                        }`}
                >
                    <ListTree className="size-4" />
                </button>
            )}

            {/* 回到顶部（下滑显示；隐藏时不占位，上方按钮下移） */}
            {showTop && (
                <button
                    type="button"
                    onClick={scrollToTop}
                    aria-label="回到顶部"
                    title="回到顶部"
                    className="flex size-10 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-lg backdrop-blur transition-colors hover:border-primary hover:text-primary"
                >
                    <ArrowUp className="size-4" />
                </button>
            )}

        </div>
    );
}
