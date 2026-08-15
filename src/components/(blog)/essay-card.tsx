import type { Essay } from "@/types/essays";
import { resolveAssetUrl } from "@/lib/utils";

function formatTime(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
}

/** 即刻 / 说说卡片（紧凑型，适合瀑布流布局） */
export function EssayCard({ essay }: { essay: Essay }) {
    const images = (essay.image ?? [])
        .map((url) => resolveAssetUrl(url))
        .filter((url): url is string => url !== null);

    return (
        <div className="rounded-xl border bg-card p-3.5 shadow-sm transition-shadow hover:shadow-md">
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{essay.content}</p>

            {/* 图片保持原始比例，让卡片高度自然变化（瀑布流效果） */}
            {images.length > 0 && (
                <div className={`mt-2.5 grid gap-1.5 ${images.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
                    {images.map((src, index) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            key={index}
                            src={src}
                            alt=""
                            loading="lazy"
                            className="w-full rounded-lg object-cover"
                        />
                    ))}
                </div>
            )}

            <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-muted-foreground">
                <span>{formatTime(essay.created_at)}</span>
                {essay.address && <span>📍{essay.address}</span>}
                {essay.from && <span>来自 {essay.from}</span>}
                {essay.link && (
                    <a
                        href={essay.link}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="text-primary hover:underline"
                    >
                        链接
                    </a>
                )}
            </div>
        </div>
    );
}
