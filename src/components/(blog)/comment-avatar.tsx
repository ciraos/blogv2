"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

/**
 * 评论/用户头像（带兜底）。
 *
 * 为什么需要它：头像地址来自第三方（站点配置的 GRAVATAR_URL，默认 cravatar.com），
 * 一旦那个域名挂掉 / 被墙 / 超时，`<img>` 就只是一个空框或碎图 —— 2026-10 就踩过一次：
 * 后台配的 `cravatar.cn` 会 301 到连不上的 `cn.cravatar.com`，评论区所有人的头像集体消失。
 *
 * 现在：加载失败（onError）就地退化成「首字圆形头像」——与友链卡、说说卡里
 * 「加载失败就用名称首字兜底」的既有做法一致，视觉上至少还有人。
 *
 * 注意：这是**客户端**组件（要用 onError），但可以安全地被服务端组件 import。
 */
export function CommentAvatar({
    src,
    name,
    className,
    title,
}: {
    src: string;
    /** 昵称：用于 alt 与首字兜底 */
    name?: string | null;
    /** 尺寸/形状类名（如 "size-9 rounded-full border object-cover"） */
    className?: string;
    title?: string;
}) {
    const [failed, setFailed] = useState(false);
    const label = (name ?? "").trim();
    const initial = (label || "?").slice(0, 1).toUpperCase();

    if (failed) {
        return (
            <span
                aria-label={label || "匿名"}
                title={title ?? label}
                // 兜底块：同尺寸圆形 + 主题色浅底，避免布局跳动
                className={cn(
                    "inline-flex shrink-0 items-center justify-center bg-muted text-[0.7em] font-semibold text-muted-foreground select-none",
                    className,
                    "border-0 object-cover"
                )}
            >
                {initial}
            </span>
        );
    }

    return (
        // 头像**故意不用 next/image**：图源是第三方（cravatar），
        // 走 next/image 就变成「**服务器**去抓 cravatar」再转一手 —— 实测本机服务器抓 cravatar
        // 超过 Next 优化器的上游超时，返回 504（浏览器直连反而可能已经在缓存里了）。
        // 第三方头像交给浏览器直连更稳，失败时用上面的首字兜底。
        // eslint-disable-next-line @next/next/no-img-element
        <img
            src={src}
            alt={label || "匿名"}
            title={title ?? label}
            loading="lazy"
            className={className}
            onError={() => setFailed(true)}
        />
    );
}
