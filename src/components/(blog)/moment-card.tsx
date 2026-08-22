"use client";

import { useState } from "react";

import type { MomentItem } from "@/types/moments";
import { resolveAssetUrl } from "@/lib/utils";

function formatTime(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function initials(name: string): string {
    return name.trim().charAt(0) || "友";
}

/** 朋友圈卡片（flex 纵向：内容顶对齐，时间贴底，适配 grid 等高拉伸） */
export function MomentCard({ moment }: { moment: MomentItem }) {
    const logo = resolveAssetUrl(moment.link_logo);
    // 头像加载失败或数据里就是占位图时，切到首字圆形兜底
    const [avatarFailed, setAvatarFailed] = useState(false);
    const isPlaceholderLogo = !!logo && /404|placeholder|default/i.test(logo);
    const showInitials = avatarFailed || isPlaceholderLogo || !logo;

    return (
        <div className="flex h-full flex-col rounded-lg border bg-card p-3.5 shadow-sm transition-shadow hover:shadow-md">
            <a
                href={moment.post_url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="block flex-1"
            >
                {/* 友链信息 */}
                <div className="flex items-center gap-2">
                    {logo && !showInitials ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={logo}
                            alt=""
                            loading="lazy"
                            onError={() => setAvatarFailed(true)}
                            className="size-6 shrink-0 rounded-full object-cover"
                        />
                    ) : (
                        <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                            {initials(moment.link_name)}
                        </div>
                    )}
                    <span className="truncate text-xs font-medium text-muted-foreground">{moment.link_name}</span>
                </div>

                {/* 文章标题 */}
                <h3 className="mt-2 line-clamp-2 text-sm font-semibold leading-snug group-hover:text-primary">
                    {moment.post_title}
                </h3>

                {/* 摘要 */}
                {moment.post_summary && (
                    <p className="mt-1.5 line-clamp-4 text-xs leading-relaxed text-muted-foreground">
                        {moment.post_summary}
                    </p>
                )}
            </a>

            {/* 时间（mt-auto 贴底） */}
            <div className="mt-2.5 border-t pt-2 text-[11px] text-muted-foreground">
                {formatTime(moment.published_at)}
            </div>
        </div>
    );
}
