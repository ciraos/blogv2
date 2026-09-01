"use client";

import { useEffect, useRef, useState } from "react";
import { PieChart } from "lucide-react";
import Link from "next/link";

import type { BasicStats } from "@/lib/api";

interface StatItem {
    label: string;
    id: string;
    value: number;
}

// 关于页访问统计卡：数字滚动动画（复刻 anheyu-app StatisticCard）
export function AboutStatisticCard({ stats, cover }: { stats: BasicStats; cover: string }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const animatedRef = useRef(false);
    const [items] = useState<StatItem[]>([
        { label: "今日人数", id: "today-visitors", value: stats.today_visitors || 0 },
        { label: "今日访问", id: "today-views", value: stats.today_views || 0 },
        { label: "昨日人数", id: "yesterday-visitors", value: stats.yesterday_visitors || 0 },
        { label: "昨日访问", id: "yesterday-views", value: stats.yesterday_views || 0 },
        { label: "本月访问", id: "month-views", value: stats.month_views || 0 },
        { label: "年访问量", id: "year-views", value: stats.year_views || 0 },
    ]);

    const animateNumber = (element: HTMLElement, target: number) => {
        let current = 0;
        const duration = 1500 + Math.random() * 1000;
        const increment = target / (duration / 16);
        const timer = setInterval(() => {
            current += increment;
            if (current >= target) {
                current = target;
                clearInterval(timer);
            }
            element.textContent = Math.floor(current).toLocaleString();
        }, 16);
    };

    useEffect(() => {
        if (!containerRef.current || animatedRef.current) return;
        animatedRef.current = true;
        const start = () => {
            containerRef.current?.querySelectorAll("[data-stat-value]").forEach((el) => {
                const value = parseInt(el.getAttribute("data-stat-value") || "0", 10);
                if (value > 0) animateNumber(el as HTMLElement, value);
            });
        };
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        start();
                        observer.disconnect();
                    }
                });
            },
            { threshold: 0.3 }
        );
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

    return (
        <div
            ref={containerRef}
            className="about-statistic relative w-full overflow-hidden rounded-xl text-white md:min-h-[380px] md:w-[39%]"
            style={{ backgroundImage: `url(${cover})`, backgroundPosition: "top", backgroundSize: "cover" }}
        >
            <div className="relative z-[2] flex h-full w-full flex-col p-2.5">
                <div className="mb-2.5 text-xs opacity-80">数据</div>
                <span className="text-4xl font-bold leading-none">访问统计</span>
                <div className="mt-4 flex w-full flex-wrap justify-between text-base text-white">
                    {items.map((stat) => (
                        <div key={stat.id} className="mb-2 flex w-1/2 flex-col justify-between">
                            <span className="text-xs opacity-80">{stat.label}</span>
                            <span className="whitespace-nowrap text-4xl font-bold leading-none md:text-[34px]">
                                <span data-stat-value={stat.value}>0</span>
                            </span>
                        </div>
                    ))}
                </div>
                <div className="mt-auto flex items-center justify-between text-xs text-white md:absolute md:bottom-6 md:left-8 md:right-8">
                    <div className="flex items-center gap-1.5 opacity-60">
                        <PieChart size={14} />
                        <span>数据由本站自主统计</span>
                    </div>
                    <Link
                        href="/article-statistics"
                        className="flex items-center gap-1.5 rounded-full bg-black/60 px-4 py-2 text-sm text-white transition-all hover:translate-x-1 hover:bg-black/80"
                    >
                        <span>文章统计</span>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M7 17 17 7" />
                            <path d="M7 7h10v10" />
                        </svg>
                    </Link>
                </div>
            </div>
        </div>
    );
}
