"use client";

import { useEffect, useState } from "react";

/**
 * 页头时钟（系统设置 → 导航与页头 → 页头附加项 → 显示时钟，`header.nav.clock`）。
 *
 * 两个约束：
 * 1. **SSR 不渲染时间**：服务端时钟和访客本地时区未必一致，直出会造成 hydration 不一致，
 *    所以首帧只占位（同宽空白），挂载后才写入真实时间。
 * 2. **占位不跳**：固定宽度 + 等宽数字，时间从空到 `HH:MM` 不会把右侧图标挤动。
 *
 * 刷新频率 15s（不是 1s）：只显示到分钟，15 秒足够对齐分钟边界，又比秒级定时器省。
 */
export function HeaderClock() {
    const [now, setNow] = useState<Date | null>(null);

    useEffect(() => {
        const tick = () => setNow(new Date());
        tick();
        const timer = window.setInterval(tick, 15_000);
        return () => window.clearInterval(timer);
    }, []);

    return (
        <time
            // 首帧无内容：给屏幕阅读器也不报时间，避免读到空
            dateTime={now ? now.toISOString() : undefined}
            aria-hidden={now ? undefined : true}
            title={now ? "当前时间" : undefined}
            className="mr-1 hidden w-11 shrink-0 text-center font-mono text-[13px] tabular-nums leading-none text-muted-foreground select-none sm:block"
        >
            {now
                ? `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
                : ""}
        </time>
    );
}
