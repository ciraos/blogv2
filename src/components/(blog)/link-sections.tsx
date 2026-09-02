"use client";

import { useEffect, useState } from "react";

import { LinkCard } from "@/components/(blog)/link-card";
import type { FriendLink, LinkCategory } from "@/types/links";

export interface LinkSection {
    category: LinkCategory;
    links: FriendLink[];
}

const STORAGE_KEY = "link_category_order";
/** 永远置顶的分区名（即使暂无友链也展示占位） */
const PINNED_TOP = "推荐";
/** 永远沉底的分区名 */
const PINNED_BOTTOM = "已失联";

/**
 * 友链分区列表（客户端）：
 * - 「推荐」永远在最上（空分区显示占位文案），「已失联」永远在最下；
 * - 其余分区：若管理员在后台拖拽保存过排序（localStorage: link_category_order，
 *   分类 id 数组）则按该顺序，否则保持 API 传入顺序（新部署无需改代码）。
 */
export function LinkSections({ sections }: { sections: LinkSection[] }) {
    const [ordered, setOrdered] = useState<LinkSection[]>(sections);

    useEffect(() => {
        // React Compiler 规则：effect 内不直接同步 setState，用宏任务包裹
        const timer = setTimeout(() => {
            try {
                const raw = localStorage.getItem(STORAGE_KEY);
                const ids: number[] = raw ? JSON.parse(raw) : [];
                const savedIds = Array.isArray(ids) && ids.length > 0 ? ids : null;

                const isPinnedTop = (s: LinkSection) => s.category.name === PINNED_TOP;
                const isPinnedBottom = (s: LinkSection) => s.category.name === PINNED_BOTTOM;

                const top = sections.filter(isPinnedTop);
                const bottom = sections.filter(isPinnedBottom);
                const middle = sections.filter((s) => !isPinnedTop(s) && !isPinnedBottom(s));

                let mid: LinkSection[];
                if (savedIds) {
                    const byId = new Map(middle.map((s) => [s.category.id, s]));
                    mid = [];
                    for (const id of savedIds) {
                        const sec = byId.get(id);
                        if (sec) {
                            mid.push(sec);
                            byId.delete(id);
                        }
                    }
                    // 未在保存列表里的分类（新增分类）按 API 顺序追加到末尾
                    for (const sec of middle) if (byId.has(sec.category.id)) mid.push(sec);
                } else {
                    mid = middle;
                }

                setOrdered([...top, ...mid, ...bottom]);
            } catch {
                setOrdered(sections);
            }
        }, 0);
        return () => clearTimeout(timer);
    }, [sections]);

    if (ordered.length === 0) {
        return <p className="py-16 text-center text-muted-foreground">暂无友情链接</p>;
    }

    return (
        <>
            {ordered.map(({ category, links }) => (
                <section key={category.id}>
                    <h2 className="text-lg font-semibold">{category.name}</h2>
                    {category.description && (
                        <p className="mt-0.5 text-sm text-muted-foreground">{category.description}</p>
                    )}
                    {links.length === 0 ? (
                        /* 空分区（如「推荐」暂无友链）占位文案 */
                        <p className="mt-3 rounded-lg border border-dashed py-6 text-center text-sm text-muted-foreground">
                            暂无{category.name}友链，敬请期待~
                        </p>
                    ) : (
                        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {links.map((link) => (
                                <LinkCard key={link.id} link={link} />
                            ))}
                        </div>
                    )}
                </section>
            ))}
        </>
    );
}
