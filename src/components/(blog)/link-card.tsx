"use client";

import { useState } from "react";

import type { FriendLink } from "@/types/links";
import { resolveAssetUrl } from "@/lib/utils";

import { LinkAvatar } from "@/components/(blog)/link-avatar";

function initials(name: string): string {
    return name.trim().charAt(0) || "友";
}

/** 首字圆形头像兜底 */
function InitialsAvatar({ name }: { name: string }) {
    return (
        <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-semibold text-primary-foreground">
            {initials(name)}
        </div>
    );
}

export function LinkCard({ link }: { link: FriendLink }) {
    const logo = resolveAssetUrl(link.logo);
    const siteUrl = link.url.startsWith("http") ? link.url : `https://${link.url}`;
    // 头像加载失败时切到首字兜底
    const [avatarFailed, setAvatarFailed] = useState(false);
    // 数据里直接填了占位图（如 404_1.avif）的视为无头像
    const isPlaceholderLogo = !!logo && /404|placeholder|default/i.test(logo);

    return (
        <a
            href={siteUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="group flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary hover:shadow-md"
        >
            {logo && !avatarFailed && !isPlaceholderLogo ? (
                <LinkAvatar src={logo} alt={link.name} onError={() => setAvatarFailed(true)} />
            ) : (
                <InitialsAvatar name={link.name} />
            )}

            <div className="min-w-0">
                <div className="truncate text-sm font-semibold group-hover:text-primary">{link.name}</div>
                {link.description && (
                    <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{link.description}</div>
                )}
            </div>
        </a>
    );
}
