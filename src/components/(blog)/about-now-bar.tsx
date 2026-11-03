"use client";

import { useEffect, useState } from "react";
import { Headphones, Music2, PencilLine, Sprout } from "lucide-react";

/**
 * 关于页「此刻」状态条。
 *
 * 左侧「此刻在听」实时跟随左下角的迷你播放器：播放器每次切歌/播放/暂停都会派发
 * `mini-player:state` 事件（见 mini-music-player.tsx），这里监听即可，不重复拉歌单。
 * 其余三项是构建期由服务端算好的静态数字。
 */
export interface MiniPlayerState {
    name: string;
    artist: string;
    playing: boolean;
}

export function AboutNowBar({
    songs,
    articles,
    essays,
    days,
}: {
    songs: number;
    articles: number;
    essays: number;
    days: number | null;
}) {
    const [now, setNow] = useState<MiniPlayerState | null>(null);

    useEffect(() => {
        const onState = (e: Event) => {
            const detail = (e as CustomEvent<MiniPlayerState>).detail;
            if (detail?.name) setNow(detail);
        };
        window.addEventListener("mini-player:state", onState);
        return () => window.removeEventListener("mini-player:state", onState);
    }, []);

    const chips = [
        {
            icon: <Headphones className="size-3.5" />,
            text: now ? `此刻在听 · ${now.name}${now.artist ? ` - ${now.artist}` : ""}` : "此刻在听 · 电台待机中",
            accent: Boolean(now?.playing),
        },
        {
            icon: <PencilLine className="size-3.5" />,
            text: `${articles} 篇文章 · ${essays} 条说说`,
            accent: false,
        },
        {
            icon: <Music2 className="size-3.5" />,
            text: `${songs} 首歌`,
            accent: false,
        },
        ...(days !== null
            ? [{ icon: <Sprout className="size-3.5" />, text: `建站 ${days} 天`, accent: false }]
            : []),
    ];

    return (
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-2">
            {chips.map((chip) => (
                <span
                    key={chip.text}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${
                        chip.accent
                            ? "border-primary/40 bg-primary/10 text-primary"
                            : "border-border bg-card text-muted-foreground"
                    }`}
                >
                    {chip.icon}
                    <span className="max-w-[16rem] truncate">{chip.text}</span>
                </span>
            ))}
        </div>
    );
}
