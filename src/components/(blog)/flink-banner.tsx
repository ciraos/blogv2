"use client";

import { useMemo, useState } from "react";
import { Navigation, Send } from "lucide-react";

import { resolveAssetUrl } from "@/lib/utils";
import type { FriendLink } from "@/types/links";

/** 首字圆形兜底（logo 缺失时用） */
function FlinkInitial({ name, color }: { name: string; color: string }) {
    return (
        <span
            className="flex h-full w-full items-center justify-center rounded-full text-2xl font-bold text-white"
            style={{ background: color }}
        >
            {name.trim().charAt(0) || "友"}
        </span>
    );
}

/** 从名字生成稳定底色（头像缺失时首字圆底） */
function colorFromName(name: string): string {
    const palette = ["#4285f4", "#34a853", "#9b59b6", "#e91e63", "#f29900", "#00a8a8", "#8e44ad", "#e74c3c"];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
    return palette[hash % palette.length];
}

/** 友链头像圆（120px；无 logo / 失效占位图 / 加载失败时用首字圆兜底） */
function FlinkAvatar({ name, logo }: { name: string; logo: string | null }) {
    const color = useMemo(() => colorFromName(name), [name]);
    const [avatarFailed, setAvatarFailed] = useState(false);
    // 数据里直接填了失效占位图（如 404_1.avif）的视为无头像
    const isPlaceholderLogo = !!logo && /404|placeholder|default/i.test(logo);
    const showInitials = avatarFailed || isPlaceholderLogo || !logo;

    return (
        <span
            className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-full shadow-lg transition-transform duration-300 hover:scale-105 md:size-30"
            title={name}
        >
            {showInitials ? (
                <FlinkInitial name={name} color={color} />
            ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={logo ?? ""}
                    alt={name}
                    loading="lazy"
                    onError={() => setAvatarFailed(true)}
                    className="h-full w-full object-cover"
                />
            )}
        </span>
    );
}

/** 排好两排交错 logo 墙所需的可滚动序列（两两成对：上排偶数位、下排奇数位，左右无缝循环）。
 *  默认纳入全部友链头像，滚动可遍历每个友链；仅当友链太少(<16)才循环填充以保证轨道铺满容器。 */
function useWallWallItems(links: FriendLink[]) {
    return useMemo(() => {
        const raw = links.map((l) => ({ name: l.name, logo: resolveAssetUrl(l.logo) }));
        if (raw.length === 0) return { top: [], bottom: [] };
        // 数量足够则用全部友链；太少则循环填充到 16 个，避免轨道出现空白
        const base = raw.length >= 16 ? raw : Array.from({ length: 16 }, (_, i) => raw[i % raw.length]);
        // 两两成对：上排取偶数位、下排取奇数位（每个友链只出现一次，上下不重复）
        const topBase = base.filter((_, i) => i % 2 === 0);
        const bottomBase = base.filter((_, i) => i % 2 === 1);
        // 各复制两份 → 轨道 translateX(0 → -50%) 无缝循环
        return { top: [...topBase, ...topBase], bottom: [...bottomBase, ...bottomBase] };
    }, [links]);
}

/**
 * 友链页顶部 Banner（复刻 anheyu 线上版）：
 * 渐变标题「与数百名博主无限进步」 + 右上「随机访问 / 申请友链」 + 底部两排交错滚动的友链 logo 墙。
 * 随机访问：从全部友链中随机选一个跳转；申请友链：锚点滚动到 #apply。
 */
export function FlinkBanner({ links }: { links: FriendLink[] }) {
    const { top, bottom } = useWallWallItems(links);

    /** 随机访问：随机挑一个友链在新标签打开 */
    function randomVisit() {
        const candidates = links.filter((l) => l.url);
        if (candidates.length === 0) return;
        const pick = candidates[Math.floor(Math.random() * candidates.length)];
        const url = pick.url.startsWith("http") ? pick.url : `https://${pick.url}`;
        window.open(url, "_blank", "noopener,noreferrer");
    }

    return (
        <div className="relative flex min-h-[26rem] flex-col overflow-hidden rounded-xl border bg-card shadow-sm md:min-h-[30rem]">
            {/* 标题：左上 */}
            <div className="absolute left-6 top-6 z-10 md:left-10 md:top-8">
                <p className="mb-2 ml-0.5 text-xs text-muted-foreground">友情链接</p>
                <h2 className="bg-gradient-to-r from-[#4285f4] via-[#9b59b6] via-[#e91e63] to-[#f44336] bg-clip-text text-2xl font-extrabold leading-none text-transparent md:text-[2rem]">
                    与数百名博主无限进步
                </h2>
            </div>

            {/* 按钮组：右上（移动端隐藏，同线上） */}
            <div className="absolute right-6 top-8 z-10 hidden items-center md:right-10 md:flex">
                <button
                    type="button"
                    onClick={randomVisit}
                    className="mr-4 inline-flex items-center gap-1.5 rounded-xl border bg-muted/50 px-3 py-2.5 text-sm transition-all duration-300 hover:border-primary hover:text-primary"
                >
                    <Navigation className="size-4" />
                    随机访问
                </button>
                <a
                    href="#apply"
                    className="inline-flex items-center gap-1.5 rounded-xl bg-foreground px-3 py-2.5 text-sm font-bold text-background transition-all duration-300 hover:bg-primary hover:text-white"
                >
                    <Send className="size-4" />
                    申请友链
                </a>
            </div>

            {/* 两排交错 logo 墙（可 hover：暂停滚动 + 图标放大；上下序列错位不重复） */}
            {top.length > 0 && (
                <div className="mt-auto overflow-hidden pb-10 pt-8">
                    {/* 上排 */}
                    <div className="link-tag-wall-track flex items-center gap-x-6">
                        {top.map((item, index) => (
                            <FlinkAvatar key={`top-${index}-${item.name}`} name={item.name} logo={item.logo} />
                        ))}
                    </div>
                    {/* 下排：外包一层 wrapper 做整体左移错位（不与内部滚动动画的 transform 冲突） */}
                    <div className="relative -translate-x-10 mt-6 md:-translate-x-15 md:mt-7">
                        <div className="link-tag-wall-track flex items-center gap-x-6">
                            {bottom.map((item, index) => (
                                <FlinkAvatar key={`bottom-${index}-${item.name}`} name={item.name} logo={item.logo} />
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* 左右淡出遮罩 */}
            <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-card to-transparent" />
            <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-card to-transparent" />
        </div>
    );
}
