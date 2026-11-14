"use client";

import { useState } from "react";

import type { FriendLink } from "@/types/links";
import { resolveAssetUrl } from "@/lib/utils";

import { LinkAvatar } from "@/components/(blog)/link-avatar";
import { LINK_AVATAR_FALLBACK } from "@/lib/link-avatar-fallback";

/** 头像加载失败 / 缺失时的兜底图（全站统一的 404 头像） */
function FallbackAvatar() {
    return (
        // eslint-disable-next-line @next/next/no-img-element -- CDN 托管，浏览器直连
        <img
            src={LINK_AVATAR_FALLBACK}
            alt=""
            aria-hidden="true"
            loading="lazy"
            className="size-12 shrink-0 rounded-full border bg-muted object-cover"
        />
    );
}

export function LinkCard({ link }: { link: FriendLink }) {
    const logo = resolveAssetUrl(link.logo);
    const siteUrl = link.url.startsWith("http") ? link.url : `https://${link.url}`;
    // 头像加载失败时切到首字兜底
    const [avatarFailed, setAvatarFailed] = useState(false);
    // 数据里直接填了占位图（如 404_1.avif）的视为无头像
    const isPlaceholderLogo = !!logo && /404|placeholder|default/i.test(logo);
    // 已失联：健康检查判定站点无法访问后由后端标为 INVALID（友链页按分类展示，这类友链仍会列出），
    // 所以要给出视觉区分 —— 整卡降透明度 + 去饱和，右下角「已失联」角标；鼠标悬浮恢复原样，仍可点击。
    const isLost = link.status === "INVALID";

    return (
        <a
            href={siteUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            title={isLost ? "该友链站点已无法访问（已失联）" : undefined}
            className={`group relative flex items-center gap-3 soft-surface p-4 transition-all hover:-translate-y-0.5 hover:border-primary soft-surface-hover${
                isLost ? " opacity-60 saturate-50 hover:opacity-100 hover:saturate-100" : ""
            }`}
        >
            {logo && !avatarFailed && !isPlaceholderLogo ? (
                <LinkAvatar src={logo} alt={link.name} onError={() => setAvatarFailed(true)} />
            ) : (
                <FallbackAvatar />
            )}

            <div className="min-w-0">
                <div className="truncate text-sm font-semibold group-hover:text-primary">{link.name}</div>
                {link.description && (
                    <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{link.description}</div>
                )}
            </div>

            {isLost && (
                /* 右下角角标：落在卡片 padding 区内（正文块下方），与站名/描述留出 3px 间隙、不重叠；
                   pointer-events-none 不挡点击。leading-3 与 bottom-0.5 一起保证"正文块下沿 → 角标上沿"始终有空隙 */
                <span className="pointer-events-none absolute bottom-0.5 right-2 rounded-full border border-border bg-muted px-1.5 py-px text-[10px] leading-3 font-medium text-muted-foreground">
                    已失联
                </span>
            )}
        </a>
    );
}
