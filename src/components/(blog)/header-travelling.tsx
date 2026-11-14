"use client";

import { useCallback, useRef } from "react";
import { TrainFront } from "lucide-react";
import { toast } from "sonner";

const TRAVELLING_URL = "https://www.travellings.cn/go.html";
/** 与官方主题一致：警告停留 5 秒后自动跳转 */
const DELAY = 5000;

/**
 * 「开往」入口（系统设置 → 导航与页头 → 页头附加项 → 显示开往 travelling，`header.nav.travelling`）。
 *
 * 行为对齐官方主题 / anheyu-pro：
 * 1. 点击后弹出提示，明确告知要去的是「开往」项目的随机成员博客、不保证安全；
 * 2. 5 秒后自动在新标签页打开，期间可点「取消」中止；
 * 3. 再点一次会重置倒计时，不会叠加多个定时器。
 *
 * 为什么不是直接 <a href>：跨站跳转前给访客一个反悔窗口，也是原主题的既有约定。
 */
export function HeaderTravelling() {
    const timer = useRef<number | null>(null);

    const handleClick = useCallback(() => {
        if (timer.current) window.clearTimeout(timer.current);

        const toastId = toast("即将跳转到「开往」项目的成员博客，不保证跳转网站的安全性和可用性", {
            duration: DELAY,
            action: {
                label: "取消",
                onClick: () => {
                    if (timer.current) {
                        window.clearTimeout(timer.current);
                        timer.current = null;
                    }
                    toast.dismiss(toastId);
                    toast("跳转已取消");
                },
            },
        });

        timer.current = window.setTimeout(() => {
            timer.current = null;
            window.open(TRAVELLING_URL, "_blank", "noopener,noreferrer");
        }, DELAY);
    }, []);

    return (
        <button
            type="button"
            onClick={handleClick}
            aria-label="开往 - 随机前往一个开往项目网站"
            title="随机前往一个开往项目网站"
            className="hidden size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:inline-flex"
        >
            <TrainFront className="size-5" />
        </button>
    );
}
