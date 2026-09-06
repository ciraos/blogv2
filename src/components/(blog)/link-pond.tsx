"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";

import { getRandomMomentPostClientApi } from "@/lib/api";
import type { RandomMomentPost } from "@/types/moments";

/** 线上「钓鱼」趣味前缀，每次随机一句（换一篇时重新抽） */
const FISH_LINES = [
    "外星人降临地球学习地球文化，落地时被你塞了",
    "考古学家发现了一篇沉睡千年的文章，来自友链",
    "你在深海里打捞起一份宝藏，来自友链",
    "有一只信鸽穿越山海送来一篇文章，来自友链",
];

function pick<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * 钓鱼：随机展示一篇朋友圈/友链聚合文章（GET /pro/moments/randompost）。
 * 标题头「🎣 钓鱼」+ 右上旋转刷新按钮 + 一行可点击文字（来自友链 XX 的文章：title）。
 */
export function LinkPond({ initial }: { initial: RandomMomentPost | null }) {
    const [post, setPost] = useState<RandomMomentPost | null>(initial);
    const [prefix, setPrefix] = useState<string>(() => pick(FISH_LINES));
    const [loading, setLoading] = useState(false);

    async function shuffle() {
        if (loading) return;
        setLoading(true);
        const next = await getRandomMomentPostClientApi();
        setLoading(false);
        if (next) {
            setPost(next);
            setPrefix(pick(FISH_LINES));
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
            <div className="mt-2 rounded-xl border bg-card px-5 py-4 text-sm leading-relaxed shadow-sm">
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
