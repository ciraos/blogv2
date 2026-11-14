"use client";

import { useEffect, useState } from "react";
import { Clock3, MapPin, MessageCircle, UserRound } from "lucide-react";

import { EssayContent } from "@/components/(blog)/essay-content";
import type { Essay } from "@/types/essays";
import { resolveAssetUrl } from "@/lib/utils";

function formatAbsolute(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function formatRelative(iso: string, now: number): string {
    const diff = Math.max(0, now - new Date(iso).getTime());
    const min = Math.floor(diff / 60000);
    if (min < 1) return "刚刚";
    if (min < 60) return `${min}分钟前`;
    const hour = Math.floor(min / 60);
    if (hour < 24) return `${hour}小时前`;
    const day = Math.floor(hour / 24);
    if (day < 30) return `${day}天前`;
    const month = Math.floor(day / 30);
    if (month < 12) return `${month}个月前`;
    return `${Math.floor(month / 12)}年前`;
}

/**
 * 说说的卡片底色：五种低饱和纸色，按 id 稳定取一种（不是随机 —— 同一条说说刷新前后颜色一致）。
 * 深浅色各一份：浅色用 50 号浅底，深色用同色系 6% 透明度，避免在暗背景上炸眼。
 */
const ESSAY_TONES = [
    { bg: "bg-amber-100/80 dark:bg-amber-400/[0.06]" },
    { bg: "bg-teal-100/80 dark:bg-teal-400/[0.06]" },
    { bg: "bg-rose-100/80 dark:bg-rose-400/[0.06]" },
    { bg: "bg-violet-100/80 dark:bg-violet-400/[0.06]" },
    { bg: "bg-emerald-100/80 dark:bg-emerald-400/[0.06]" },
] as const;

function toneFor(id: string | number) {
    const key = String(id);
    let hash = 0;
    for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
    return ESSAY_TONES[hash % ESSAY_TONES.length];
}

interface EssayCardProps {
    essay: Essay;
    onImageClick: (index: number) => void;
    /** 点击右下角「评论」：把该条说说作为引用带到页面底部的评论区 */
    onComment: (essay: Essay) => void;
}

/** 即刻 / 说说卡片（对齐线上格式：文字 + 方形缩略图 + 虚线 + 底部信息条） */
export function EssayCard({ essay, onImageClick, onComment }: EssayCardProps) {
    const tone = toneFor(essay.id);
    const images = (essay.image ?? [])
        .map((url) => resolveAssetUrl(url))
        .filter((url): url is string => url !== null);

    // 相对时间：先渲染绝对时间避免 hydration 不一致，挂载后再切相对时间
    const [now, setNow] = useState<number | null>(null);
    useEffect(() => {
        const t = setTimeout(() => setNow(Date.now()), 0);
        const iv = setInterval(() => setNow(Date.now()), 60000);
        return () => {
            clearTimeout(t);
            clearInterval(iv);
        };
    }, []);

    const timeText = now === null ? formatAbsolute(essay.created_at) : formatRelative(essay.created_at, now);

    return (
                <article
            className={`group/essay soft-surface soft-surface-hover p-4 transition-transform duration-200 hover:-translate-y-0.5 ${tone.bg}`}
        >
            {/* 说说内容：轻量 Markdown（换行原样保留，另支持 **粗体** *斜体* ~~删除线~~ `代码` [链接](url) ![图片](url)） */}
            <EssayContent
                content={essay.content}
                className="mb-2 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-foreground sm:text-sm"
            />

            {/* 方形缩略图（对齐线上 117px，点击打开看图器） */}
            {images.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {images.map((src, i) => (
                        <button
                            key={i}
                            type="button"
                            onClick={() => onImageClick(i)}
                            className="block cursor-zoom-in overflow-hidden rounded-md"
                            aria-label={`查看图片 ${i + 1}`}
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={src}
                                alt=""
                                loading="lazy"
                                className="size-[104px] rounded-md object-cover transition-transform duration-300 hover:scale-105 sm:size-[117px]"
                            />
                        </button>
                    ))}
                </div>
            )}

            {/* 底部信息条 */}
            <div className="mt-3 flex items-center justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[10px] tracking-[0.12em] text-muted-foreground/80 uppercase">
                    <span className="inline-flex items-center gap-1">
                        <Clock3 className="size-3.5" />
                        {timeText}
                    </span>
                    {essay.from && (
                        <span className="inline-flex items-center gap-1">
                            <UserRound className="size-3.5" />
                            {essay.from}
                        </span>
                    )}
                    {essay.address && (
                        <span className="inline-flex items-center gap-1">
                            <MapPin className="size-3.5" />
                            {essay.address}
                        </span>
                    )}
                    {essay.link && (
                        <a
                            href={essay.link}
                            target="_blank"
                            rel="noopener noreferrer nofollow"
                            className="text-primary hover:underline"
                        >
                            链接
                        </a>
                    )}
                </div>
                <button
                    type="button"
                    onClick={() => onComment(essay)}
                    className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-label="评论这条说说"
                    title="评论这条说说"
                >
                    <MessageCircle className="size-4" />
                </button>
            </div>
        </article>
    );
}
