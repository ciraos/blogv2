import Link from "next/link";

import type { Essay } from "@/types/essays";
import { resolveAssetUrl } from "@/lib/utils";

function formatDate(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
}

/** 首页横向时间轴：展示发表过的即刻（迷你卡片，仅「查看全部」可跳转） */
export function EssayTimeline({ essays }: { essays: Essay[] }) {
    if (essays.length === 0) return null;

    return (
        <section className="w-full">
            <div className="flex items-baseline justify-between gap-4">
                <h2 className="text-lg font-semibold tracking-tight">即刻动态</h2>
                <Link href="/essay" className="shrink-0 text-xs text-muted-foreground hover:underline">
                    查看全部 →
                </Link>
            </div>

            <div className="relative mt-4 overflow-x-auto pb-2">
                {/* 时间轴线（横向）：对准小黑点正中间（日期行 16px + mt-1 4px + 半点 5px = 25px 中心） */}
                <div className="absolute inset-x-0 top-[24px] h-0.5 bg-border" />

                <div className="flex gap-4">
                    {essays.map((essay) => (
                        <TimelineItem key={essay.id} essay={essay} />
                    ))}
                </div>
            </div>
        </section>
    );
}

function TimelineItem({ essay }: { essay: Essay }) {
    const images = (essay.image ?? [])
        .map((url) => resolveAssetUrl(url))
        .filter((url): url is string => url !== null);

    return (
        <div className="w-48 shrink-0">
            {/* 日期：小圆点正上方（固定 16px 行高，保证线条对齐） */}
            <span className="block whitespace-nowrap text-[11px] leading-4 text-muted-foreground">
                {formatDate(essay.created_at)}
            </span>
            {/* 节点：实心小黑点，时间线从中心穿过 */}
            <span className="relative z-10 mt-1 block size-2.5 rounded-full bg-primary shadow-sm" />

            {/* 迷你卡片（不可点击跳转） */}
            <div className="mt-2 rounded-lg border bg-card p-2.5 shadow-sm">
                <p className="line-clamp-4 text-xs leading-relaxed text-foreground">{essay.content}</p>

                {images.length > 0 && (
                    <div className="mt-1.5 grid grid-cols-3 gap-1">
                        {images.slice(0, 3).map((src, index) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                key={index}
                                src={src}
                                alt=""
                                loading="lazy"
                                className="h-12 w-full rounded object-cover"
                            />
                        ))}
                    </div>
                )}

                {essay.address && (
                    <div className="mt-1.5 text-[10px] text-muted-foreground">📍 {essay.address}</div>
                )}
            </div>
        </div>
    );
}
