"use client";

import { useCallback, useEffect, useRef } from "react";

interface AboutSiteTipsConfig {
    tips: string;
    title1: string;
    title2: string;
    word: string[];
}

// 关于页关键词轮播（复刻 anheyu-app AboutSiteTips）
export function AboutSiteTips({ config }: { config: AboutSiteTipsConfig }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const rotateWords = useCallback(() => {
        if (!containerRef.current) return;
        const show = containerRef.current.querySelector("span[data-show]");
        const next = show?.nextElementSibling || containerRef.current.querySelector("span:first-child");
        const up = containerRef.current.querySelector("span[data-up]");

        if (up) up.removeAttribute("data-up");
        if (show) {
            show.removeAttribute("data-show");
            show.setAttribute("data-up", "");
        }
        if (next) next.setAttribute("data-show", "");
    }, []);

    useEffect(() => {
        intervalRef.current = setInterval(rotateWords, 2000);
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [rotateWords]);

    if (!config?.word || config.word.length < 2) return null;

    const middleWords = config.word.length > 2 ? config.word.slice(0, -2) : [];
    const secondLast = config.word[config.word.length - 2];
    const lastWord = config.word[config.word.length - 1];

    return (
        <div className="flex w-full flex-none flex-col items-start justify-center rounded-xl border bg-card p-4 md:min-h-[200px] md:flex-[3]">
            <div className="mb-2 text-xs opacity-80">{config.tips}</div>
            <h2 className="m-0 mr-auto text-3xl font-bold leading-snug tracking-tight text-foreground md:text-4xl">
                {config.title1}
                <br />
                {config.title2}
                <div ref={containerRef} className="about-word-mask">
                    {middleWords.map((word, i) => (
                        <span
                            key={i}
                            className={`about-word-item about-word-color${(i % 4) + 1} ${i === 0 ? "first" : ""}`}
                        >
                            {word}
                        </span>
                    ))}
                    {secondLast && (
                        <span
                            className={`about-word-item about-word-color${(middleWords.length % 4) + 1}`}
                            data-up=""
                        >
                            {secondLast}
                        </span>
                    )}
                    {lastWord && (
                        <span
                            className={`about-word-item about-word-color${((middleWords.length + 1) % 4) + 1}`}
                            data-show=""
                        >
                            {lastWord}
                        </span>
                    )}
                </div>
            </h2>
        </div>
    );
}
