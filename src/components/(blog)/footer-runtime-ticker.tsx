"use client";

import { useEffect, useState } from "react";

import { resolveRuntimeState, type RuntimeState } from "@/lib/footer-runtime";

/** 一种状态（工作 / 休息）对应的状态图与文案 */
interface RuntimeSituation {
    img: string;
    description: string;
}

interface FooterRuntimeTickerProps {
    /** 上线时间戳：服务端已解析，客户端只做差值 */
    launchTime: number;
    /** 服务端按当前时间算好的初值，保证首帧与 SSR 的 HTML 完全一致 */
    initial: RuntimeState;
    work: RuntimeSituation;
    offduty: RuntimeSituation;
}

/**
 * 页脚运行时间的「走字」部分（官方 runtime-js.pug 里 `setInterval(..., 1000)` 的等价物）。
 *
 * 首帧必须用服务端传来的 `initial`，不能自己 `new Date()`：
 * SSR 在服务器时区渲染、hydration 在浏览器时区执行，两边各算一次就会 hydration 不一致。
 * 挂载后才交给定时器接管 —— 时间每秒走字，工作/休息也换成**访客本地时间**判断
 * （官方就是纯浏览器逻辑，所以跨时区访客看到的状态理应按他自己那边的小时算）。
 */
export function FooterRuntimeTicker({ launchTime, initial, work, offduty }: FooterRuntimeTickerProps) {
    const [state, setState] = useState(initial);

    useEffect(() => {
        const update = () => setState(resolveRuntimeState(launchTime, new Date()));
        // 挂载后立刻校正一次（服务端时区可能与访客不同），随后每秒刷新
        update();
        const timer = window.setInterval(update, 1000);
        return () => window.clearInterval(timer);
    }, [launchTime]);

    const situation = state.isWork ? work : offduty;
    const img = situation.img?.trim();
    const description = situation.description?.trim();

    return (
        <div className="mt-6 flex flex-col items-center gap-2 text-center text-xs text-muted-foreground">
            {(img || description) && (
                <div className="flex flex-wrap items-center justify-center gap-2">
                    {img && (
                        // 状态图是后台配置的外链（官方默认是「安知鱼-上班摸鱼中 / 下班啦」SVG），不参与图片优化
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={img}
                            alt={description || (state.isWork ? "工作中" : "休息中")}
                            title={description || undefined}
                            className="h-5 w-auto max-w-[130px] object-contain"
                        />
                    )}
                    {/* 官方把文案放在 img 的 alt/title（图床 SVG 里本身就写着字），这里额外把文案显示出来 */}
                    {description && <span>{description}</span>}
                </div>
            )}

            <p className="tabular-nums">
                {state.text}
                {/* 官方文案末尾的红色心跳图标（anzhiyu-icon-heartbeat） */}
                <svg
                    viewBox="0 0 24 24"
                    aria-hidden
                    className="ml-1 inline-block size-3.5 align-[-2px] text-red-500"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <path d="M2 12h4l2.5-6 4 12L15 12h7" />
                </svg>
            </p>
        </div>
    );
}
