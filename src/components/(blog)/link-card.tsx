"use client";

import { useRef, useState } from "react";

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
            className="link-avatar link-avatar--fallback size-12 shrink-0 rounded-full border bg-muted object-cover"
        />
    );
}

/**
 * 友链卡片。
 *
 * 悬停特效（样式在 globals.css 的 `.link-card` 段）：
 *  · 3D 微倾斜：跟着指针在卡片上的位置转（±7°/±9°），松手回中；
 *  · 聚光斑：径向主色光晕跟随指针，像手电照在卡面上；
 *  · 旋转描边：conic 渐变沿 1px 边框转圈；
 *  · 扫光：斜向高光一次性掠过（600ms）；
 *  · 头像：外圈转 + 轻微放大；右上角冒出「↗」。
 *
 * 只有「精确指针 + 支持 hover」的设备才做倾斜（触屏没有 hover，倾斜只会留下歪掉的卡片）；
 * 系统开了「减少动态效果」时 CSS 会关掉旋转/扫光，只保留颜色与阴影变化。
 */
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

    const cardRef = useRef<HTMLAnchorElement>(null);
    const frame = useRef<number | null>(null);
    /** 上一次的扫光方向：连续两次不重复（否则随机也会连着三次同一个方向，观感像没随机） */
    const lastShineDir = useRef(-1);

    /**
     * 每次进入卡片时随机挑一个扫光方向（→ / ← / ↓ / ↑ + 随机倾角），且不与上一次相同。
     * 之所以在 enter 时写 CSS 变量、而不是写死在一个 keyframes 里：
     * 动画只在 :hover 期间挂上，离开就摘掉，下次进入会从头播 —— 方向自然就"重摇"了。
     */
    function handlePointerEnter() {
        const el = cardRef.current;
        if (!el) return;
        const presets = [
            { fx: "-60%", tx: "60%", fy: "0%", ty: "0%" },
            { fx: "60%", tx: "-60%", fy: "0%", ty: "0%" },
            { fx: "0%", tx: "0%", fy: "-70%", ty: "70%" },
            { fx: "0%", tx: "0%", fy: "70%", ty: "-70%" },
        ];
        let index = Math.floor(Math.random() * presets.length);
        if (index === lastShineDir.current) index = (index + 1 + Math.floor(Math.random() * (presets.length - 1))) % presets.length;
        lastShineDir.current = index;
        const pick = presets[index];
        const angle = (6 + Math.random() * 10) * (Math.random() < 0.5 ? 1 : -1);
        el.style.setProperty("--shine-fx", pick.fx);
        el.style.setProperty("--shine-tx", pick.tx);
        el.style.setProperty("--shine-fy", pick.fy);
        el.style.setProperty("--shine-ty", pick.ty);
        el.style.setProperty("--shine-rot", `${angle.toFixed(1)}deg`);
    }

    /** 指针在卡片内的位置 → CSS 变量（聚光斑坐标 + 倾斜角）。用 rAF 合并，避免每个 pointermove 都改样式 */
    function handlePointerMove(event: React.PointerEvent<HTMLAnchorElement>) {
        if (event.pointerType !== "mouse") return;
        const el = cardRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        if (frame.current !== null) cancelAnimationFrame(frame.current);
        frame.current = requestAnimationFrame(() => {
            el.style.setProperty("--mx", `${x}px`);
            el.style.setProperty("--my", `${y}px`);
            el.style.setProperty("--rx", `${((y / rect.height) - 0.5) * -7}deg`);
            el.style.setProperty("--ry", `${((x / rect.width) - 0.5) * 9}deg`);
        });
    }

    function handlePointerLeave() {
        const el = cardRef.current;
        if (!el) return;
        if (frame.current !== null) cancelAnimationFrame(frame.current);
        frame.current = null;
        el.style.setProperty("--rx", "0deg");
        el.style.setProperty("--ry", "0deg");
    }

    return (
        <a
            ref={cardRef}
            href={siteUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            title={isLost ? "该友链站点已无法访问（已失联）" : undefined}
            onPointerEnter={handlePointerEnter}
            onPointerMove={handlePointerMove}
            onPointerLeave={handlePointerLeave}
            className={`link-card group relative block rounded-[var(--surface-r)]${
                isLost ? " opacity-60 saturate-50 hover:opacity-100 hover:saturate-100" : ""
            }`}
        >
            {/* 外层 <a> 只做悬停目标：友链网格给每个子元素挂了 surface-rise 入场动画，
                动画的 transform 会盖掉普通声明 —— 所以倾斜必须作用在这层内面板上。 */}
            <div className="link-card__panel relative flex items-center gap-3 overflow-hidden rounded-[var(--surface-r)] p-4 soft-surface">
                {/* 聚光斑：跟随指针的径向光；纯装饰，不吃事件 */}
                <span className="link-card__spot" aria-hidden="true" />
                {/* 扫光：悬停时斜向掠过一次 */}
                <span className="link-card__shine" aria-hidden="true" />

                {logo && !avatarFailed && !isPlaceholderLogo ? (
                    <LinkAvatar src={logo} alt={link.name} onError={() => setAvatarFailed(true)} />
                ) : (
                    <FallbackAvatar />
                )}

                <div className="relative min-w-0">
                    <div className="link-card__name truncate text-sm font-semibold transition-colors group-hover:text-primary">
                        {link.name}
                    </div>
                    {link.description && (
                        <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{link.description}</div>
                    )}
                </div>

                {/* 右上角跳转箭头：悬停时从右上滑入 */}
                <span className="link-card__arrow" aria-hidden="true">
                    ↗
                </span>

                {isLost && (
                    /* 右下角角标：落在卡片 padding 区内（正文块下方），与站名/描述留出 3px 间隙、不重叠；
                       pointer-events-none 不挡点击。leading-3 与 bottom-0.5 一起保证"正文块下沿 → 角标上沿"始终有空隙 */
                    <span className="pointer-events-none absolute bottom-0.5 right-2 rounded-full border border-border bg-muted px-1.5 py-px text-[10px] leading-3 font-medium text-muted-foreground">
                        已失联
                    </span>
                )}
            </div>
        </a>
    );
}
