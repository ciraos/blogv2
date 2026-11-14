"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";

import { getRandomMomentPostClientApi } from "@/lib/api";
import { pickFishLine } from "@/lib/fish-lines";
import type { RandomMomentPost } from "@/types/moments";

/**
 * 钓鱼：随机展示一篇朋友圈/友链聚合文章（GET /pro/moments/randompost）。
 * 标题头「🎣 钓鱼」+ 右上旋转刷新按钮 + 一行可点击文字（来自友链 XX 的文章：title）。
 *
 * 首屏那句趣味前缀由服务端抽签后经 `initialPrefix` 传入（保证 SSR 与客户端水合文本一致，
 * 见 lib/fish-lines.ts）；点「换一篇」时在客户端重新抽。
 */
export function LinkPond({
    initial,
    initialPrefix,
}: {
    initial: RandomMomentPost | null;
    initialPrefix: string;
}) {
    const [post, setPost] = useState<RandomMomentPost | null>(initial);
    const [prefix, setPrefix] = useState<string>(initialPrefix);
    const [loading, setLoading] = useState(false);

    async function shuffle() {
        if (loading) return;
        setLoading(true);
        const next = await getRandomMomentPostClientApi();
        setLoading(false);
        if (next) {
            setPost(next);
            setPrefix(pickFishLine());
        }
    }

    return (
        <div>
            {/* 标题头：🎣 钓鱼 + 右侧旋转刷新按钮（点击旋转，同线上 random-post-start） */}
            <div className="flex items-center justify-between">
                <div className="flex items-center">
                    <h2 className="text-xl font-bold">🎣 钓鱼</h2>
                    <button
                        type="button"
                        aria-label="换一篇"
                        title="换一篇"
                        onClick={() => void shuffle()}
                        disabled={loading}
                        className="ml-2 inline-flex items-center text-muted-foreground transition-transform duration-300 hover:text-primary disabled:opacity-50"
                    >
                        <RefreshCw
                            className={`size-4 ${loading ? "animate-spin" : "transition-transform duration-500 group-hover:rotate-180"}`}
                        />
                    </button>
                </div>
            </div>

            {/* 内容：一行文字（来自友链 XX 的文章：title，可点击跳原文） */}
            <div className="mt-2 soft-surface px-5 py-4 text-sm leading-relaxed">
                {post ? (
                    <p>
                        {prefix}
                        {/* 来源友链名 */}
                        <span className="font-medium underline">&nbsp;{post.author}&nbsp;</span>
                        {`的文章：`}
                        <a
                            href={post.link}
                            target="_blank"
                            rel="noopener noreferrer nofollow"
                            className="border-b-2 border-border/60 px-0.5 font-medium transition-all hover:border-primary hover:bg-primary hover:text-white"
                        >
                            {post.title}
                        </a>
                    </p>
                ) : (
                    <p className="text-muted-foreground">
                        钓鱼中...
                        <button
                            type="button"
                            onClick={() => void shuffle()}
                            disabled={loading}
                            className="ml-2 inline-flex items-center gap-1 text-xs underline underline-offset-2 hover:text-primary disabled:opacity-50"
                        >
                            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
                            重新获取
                        </button>
                    </p>
                )}
            </div>
        </div>
    );
}
