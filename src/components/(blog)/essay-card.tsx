"use client";

import { useEffect, useState } from "react";
import { Clock3, MapPin, MessageCircle, UserRound } from "lucide-react";
import { toast } from "sonner";

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

interface EssayCardProps {
    essay: Essay;
    onImageClick: (index: number) => void;
}

/** 即刻 / 说说卡片（对齐线上格式：文字 + 方形缩略图 + 虚线 + 底部信息条） */
export function EssayCard({ essay, onImageClick }: EssayCardProps) {
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
        <article className="rounded-xl border bg-card p-4 pb-2 shadow-sm transition-shadow hover:shadow-md">
            {/* 说说内容 */}
            <p className="mb-2 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-foreground sm:text-sm">
                {essay.content}
            </p>

            {/* 方形缩略图（对齐线上 117px，点击打开看图器） */}
            {images.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {images.map((src, i) => (
                        <button
                            key={i}
                            type="button"
                            onClick={() => onImageClick(i)}
                            className="block cursor-zoom-in overflow-hidden rounded-lg"
                            aria-label={`查看图片 ${i + 1}`}
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={src}
                                alt=""
                                loading="lazy"
                                className="size-[104px] rounded-lg object-cover transition-transform duration-300 hover:scale-105 sm:size-[117px]"
                            />
                        </button>
                    ))}
                </div>
            )}

            {/* 虚线分隔 */}
            <hr className="my-4 border-t border-dashed border-border" />

            {/* 底部信息条 */}
            <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
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
                    onClick={() => toast.info("评论功能暂未开放")}
                    className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-label="回复"
                    title="回复"
                >
                    <MessageCircle className="size-4" />
                </button>
            </div>
        </article>
    );
}
