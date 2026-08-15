"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import Link from "next/link";

import type { FriendLink } from "@/types/links";

interface FooterRandomLinksProps {
    initialLinks: FriendLink[];
    count: number;
}

// 页脚随机友链：标题 + 刷新按钮 + 友链名称列表 + 更多链接
export function FooterRandomLinks({ initialLinks, count }: FooterRandomLinksProps) {
    const [links, setLinks] = useState(initialLinks);
    const [loading, setLoading] = useState(false);

    async function refresh() {
        setLoading(true);
        try {
            const res = await fetch(`/api/public/links/random?num=${count}`);
            const json = (await res.json()) as { code: number; data?: FriendLink[] };
            if (res.ok && Array.isArray(json.data)) {
                setLinks(json.data);
            }
        } catch {
            // 刷新失败保持原列表
        } finally {
            setLoading(false);
        }
    }

    return (
        <div>
            <div className="mb-3 flex items-center gap-2">
                <h3 className="text-sm font-semibold">友链</h3>
                <button
                    type="button"
                    onClick={refresh}
                    disabled={loading}
                    aria-label="刷新随机友链"
                    className="inline-flex items-center justify-center p-0.5 text-black transition-opacity hover:opacity-70 disabled:opacity-60"
                >
                    <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
                </button>
            </div>
            <ul className="space-y-2">
                {links.map((link) => {
                    const siteUrl = link.url.startsWith("http") ? link.url : `https://${link.url}`;
                    return (
                        <li key={link.id}>
                            <a
                                href={siteUrl}
                                target="_blank"
                                rel="noopener noreferrer nofollow"
                                className="block text-sm text-muted-foreground transition-colors hover:text-primary"
                            >
                                {link.name}
                            </a>
                        </li>
                    );
                })}
            </ul>
            <Link
                href="/link"
                className="mt-3 block text-sm text-muted-foreground transition-colors hover:text-primary hover:underline"
            >
                更多
            </Link>
        </div>
    );
}
