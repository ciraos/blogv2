"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowUp, ListTree, PanelRightClose, PanelRightOpen } from "lucide-react";

interface TocItem {
    id: string;
    text: string;
    level: number;
}

/** (blog) 全局右下角悬浮操作组：目录（仅文章页）+ 回到顶部 + 外层触发器 */
export function FloatingActions() {
    const pathname = usePathname();
    const isPostPage = pathname.startsWith("/posts/");

    // 外层触发器展开状态（向上浮现按钮）
    const [groupOpen, setGroupOpen] = useState(false);
    // 目录面板展开状态（移动端弹出）
    const [tocOpen, setTocOpen] = useState(false);
    const [tocItems, setTocItems] = useState<TocItem[]>([]);
    const [activeId, setActiveId] = useState<string>("");
    const tocRef = useRef<HTMLDivElement | null>(null);

    /** 回到顶部 */
    const scrollToTop = useCallback(() => {
        window.scrollTo({ top: 0, behavior: "smooth" });
    }, []);

    /** 收集文章标题生成目录（在 .article-body 内找 h1-h3，跳过 # 锚点） */
    const collectToc = useCallback(() => {
        const body = document.querySelector(".article-body");
        if (!body) return;
        const items: TocItem[] = [];
        body.querySelectorAll<HTMLElement>("h1, h2, h3").forEach((heading) => {
            if (heading.closest("pre")) return;
            if (!heading.id) return;
            const text = Array.from(heading.childNodes)
                .filter((node) => !(node instanceof HTMLElement) || !node.classList.contains("heading-anchor"))
                .map((node) => node.textContent ?? "")
                .join("")
                .trim();
            if (!text) return;
            const level = heading.tagName === "H1" ? 1 : heading.tagName === "H2" ? 2 : 3;
            // 跳过 h1（文章标题），目录只显示 h2/h3
            if (level === 1) return;
            items.push({ id: heading.id, text, level });
        });
        setTocItems(items);
    }, []);

    /** 点击目录项：平滑滚动到对应标题 */
    const scrollToHeading = useCallback((id: string) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        setActiveId(id);
    }, []);

    // 目录面板打开时收集标题 + 滚动高亮
    useEffect(() => {
        if (!tocOpen || !isPostPage) return;
        if (tocItems.length === 0) {
            requestAnimationFrame(collectToc);
        }
        const onScroll = () => {
            if (tocRef.current && tocRef.current.querySelectorAll("[data-toc-id]").length === 0) {
                collectToc();
            }
            const headings = tocRef.current?.querySelectorAll<HTMLElement>("[data-toc-id]");
            if (!headings || headings.length === 0) return;
            let current = "";
            for (const h of headings) {
                const el = document.getElementById(h.dataset.tocId || "");
                if (el && el.getBoundingClientRect().top <= 80) {
                    current = h.dataset.tocId || "";
                }
            }
            if (!current && headings.length > 0) {
                current = headings[headings.length - 1].dataset.tocId || "";
            }
            setActiveId(current);
        };
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tocOpen, isPostPage, tocItems.length]);

    // 切换路由时重置状态
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
        <div className="fixed bottom-6 right-5 z-50 flex flex-col items-end gap-3">
            {/* 向上浮现的按钮组：目录（文章页）→ 回到顶部 */}
            <div
                className={`flex flex-col items-end gap-2 transition-all duration-300 ${groupOpen ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"
                    }`}
            >

                {/* 目录按钮（仅文章页，位于回到顶部下方） */}
                {isPostPage && (
                    <button
                        type="button"
                        onClick={() => setTocOpen((v) => !v)}
                        aria-label="文章目录"
                        title={tocOpen ? "收起目录" : "文章目录"}
                        className={`flex size-11 items-center justify-center rounded-full border shadow-lg backdrop-blur transition-colors ${tocOpen
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-card text-foreground hover:border-primary hover:text-primary"
                            }`}
                    >
                        {tocOpen ? <PanelRightClose className="size-5" /> : <ListTree className="size-5" />}
                    </button>
                )}
            </div>


            {/* 外层触发器（最上） */}
            <button
                type="button"
                onClick={toggleGroup}
                aria-label={groupOpen ? "收起操作按钮" : "展开操作按钮"}
                title={groupOpen ? "收起" : "展开"}
                className={`flex size-12 items-center justify-center rounded-full border shadow-lg backdrop-blur transition-all ${groupOpen
                    ? "rotate-45 border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-foreground hover:border-primary hover:text-primary"
                    }`}
            >
                <PanelRightOpen className="size-5" />
            </button>

            {/* 目录面板（移动端弹出；PC 端文章页有右侧常驻目录） */}
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
                                    className={`block w-full truncate rounded-md px-2 py-1.5 text-left text-sm transition-colors ${item.level === 1
                                        ? "font-semibold"
                                        : item.level === 2
                                            ? "pl-4"
                                            : "pl-7 text-xs"
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

            {/* 回到顶部 */}
            <button
                type="button"
                onClick={scrollToTop}
                aria-label="回到顶部"
                title="回到顶部"
                className="flex size-11 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-lg backdrop-blur transition-colors hover:border-primary hover:text-primary"
            >
                <ArrowUp className="size-5" />
            </button>

        </div>
    );
}
